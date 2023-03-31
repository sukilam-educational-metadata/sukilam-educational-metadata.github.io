/** SNORQL - an AJAXy front-end for exploring RDF SPARQL endpoints
 * based on SNORQL http://www4.wiwiss.fu-berlin.de/bizer/d2r-server/
 * originally created by Richard Cyganaik
 * adopted by kurtjx https://github.com/kurtjx/SNORQL
 * Apache-2 license
 * re-adopted and extended to work with snorql_ldb.js 2018-12-07 by masaka for Japan Search, last modified 2021-05-08
 - removed graph browse / named graph and xslt to make things simple
 - removed dependencies on prototype.js and scriptaculous.js
 - added support of CodeMirror, if it is instantiated as CMEditor
 - works better if used with snorql_ldb.js, but not necessary
 - can use multiple Snorql instances, e.g. to display more than one results tables in one page
*/
var snorql = new Snorql();
//@@added 2018-12-13
var SPARQL, D2R_namespacePrefixes, CMEditor, Snorqldef, Util,
EasySPARQL, JsonRDFFormatter, SPARQLSelectTableFormatter;

String.prototype.trim = function (){
	return this.replace(/^\s*/, "").replace(/\s*$/, "");
};

String.prototype.startsWith = function(str){
	return (this.match("^"+str) === str);
};

function Snorql(){
	//@@ basic variables ///////////////////////////////////////////////////////////
	// modify this._endpoint to point to your SPARQL endpoint
	this._endpoint = null;
	// modify these to your likeing
	this._poweredByLink = 'http://www4.wiwiss.fu-berlin.de/bizer/d2r-server/';
	this._poweredByLabel = 'D2R Server';

	this._browserBase = null;
	this._namespaces = {};
	//removed here: graph, xslt related
	this.default_query = 'SELECT DISTINCT * WHERE {\n  ?s ?p ?o\n}\nLIMIT 10';
	//this.use_browsecp	//now handle original 'browse' query by default
	//some initializations moved to init();
	this.relpath = "";	//relative path to store small icons
	this.more_ns = {};	//pfx: url pairs to be used by _formatURI
	//this.qname_ns to be declared in init();
	//ids of HTML elements, can be overridden by Snorqldef.vars.ids
	this.ids = {
		qform: "queryform",	//<form> element
		qtxt : "querytext",	//query <textarea>, also used in CSS
		qaout : "actualoutput",	//<input> to hold output mode other than "browse"
		qinput: "query",	//<input> to hold query text
		qoutsel: "selectoutput",	//<select> for output format
		res_section: "ressection",	//resutl section, also used in CSS
		res_div: "result",
		pwrdby: "poweredby"
	};
	this.elts = {};	//elements to be set from ids in init();
	this.qp_endpoint = "";	//additional url query param for "any" endpoint mode
	this.uqparam = {};	//url query parameters. to be set in init(); 2021-03-06
	
	//@@ main part ///////////////////////////////////////////////////////////////
	/**
	 * start snorql. usually called from onload() of hosting web page
	 * @param {String} presetq	optional preset query. use this when no url query param available
	 */
	this.start = function(presetq){
		this.init();	//moved several proc to inside init() 2019-04-29, 2021-02-10
		var qparam = {
			"text": null,	//querytext = sparql query (from user) -> text area default value
			"query": null,	//sparql query to send to endpoint
			"urlstring": document.location.search.substr(1), //queryString = url encoded query string
			"accept": false,	//HTTP accept request header
			"output": null,	//output format
			"preset": presetq	//optional preset query provided as start() argument
		},
		rparam = {
			"ressec": this.elts.res_section,	//section to display the results
			"resultTitle": null,	//heading label in the result display section
			"desc_uri": null,	//URI to describe
			"is_home_uri": false,	//flag to indicate the uri to describe is a resource in this triple store
			"presel": null	//pre selected for example
		};
		//setup non original parts e.g example and EasySPARQL
		this.prepare_extension(qparam, rparam);
		//setup basic query params
		this.prepare_params(qparam, rparam);
		//set query textarea. if no query, set default and retun false
		if(!this.prepare_default(qparam, rparam)) return;
		
		//setup query parameters based on query type
		this.set_qtype_params(qparam, rparam);
		//setup SPARQL service and execute query
		this.set_service(qparam.query, qparam.successFunc, qparam.accept, qparam.output);
	};
	
	//@@ methods called from start //////////////////////////////////////////////
	/**
	 * prepare query / results parameters based on url query param key
	 * @param {Object} qparam	query parameter
	 * @param {Object} rparam	results parameter
	 */
	this.prepare_params = function(qparam, rparam){
		var matched,
		submatch,	//nested regex match
		desc_uri,	//URI to describe
		is_home_uri;	//flag to indicate the uri to describe is a resource in this triple store
		
		if(!qparam.urlstring){
			//when called without url query params
			
			if(!qparam.preset){
				//simple startup (start page w/o query)
				return false;
			}else if(qparam.preset.match(/^http/)){
				//if presetq starts with http, consider it as describe request for the uri
				rparam.is_home_uri = this.set_desc_param(qparam.preset, qparam, rparam);
			}else{
				//otherwise, consider the presetq as a (non encoded) query text
				this.set_query_param(qparam.preset, qparam, rparam);
			}
		}
		else	//so when url query params present
		if((matched = qparam.urlstring.match(/describe.([^&]*)/i))) {	//2020-04-02 missing i modifier
			//// URL query param key is describe and value is target URI
			rparam.is_home_uri = this.set_desc_param(this._betterUnescape(matched[1]), qparam, rparam);
		
		}else if((matched = qparam.urlstring.match(/query=([^&]*)/))){
			//// standard SPARQL query request
			this.set_query_param(this._betterUnescape(matched[1]), qparam, rparam);
			
		}else{
			//query other than describe/query, e.g. browse class / property in original snorql
			rparam.resultTitle = this.original_class_prop_query(qparam);
		}
	};
	/**
	 * setup DESCRIBE query parameters
	 * @param {String} desc_uri	target uri to describe
	 * @param {Object} qparam	query parameter
	 * @param {Object} rparam	results parameter
	 * @return {Boolean}	true if the target uri is in this store
	 */
	this.set_desc_param = function(desc_uri, qparam, rparam){
		var matched, submatch, is_home_uri;
		//in case describe as query (not api param)
		if((matched = desc_uri.match(/<([^>]+)>/))) desc_uri = matched[1];
		if(submatch = desc_uri.match(/^(.+?)\s*(WHERE)?\s*\x7B/i)){
			//description target is a variable. Note WHERE is optional
			rparam.resultTitle = "Description of resource matched against " + submatch[1];
			qparam.text = "DESCRIBE " + desc_uri;
			desc_uri = ""; //submatch[1];	//avoid to use variable as regex pattern in e.g. set_object_tdval(). 2021-05-08
		}else{
			rparam.resultTitle = "Description of <" +  desc_uri + ">";
			qparam.text = "DESCRIBE <" + desc_uri + ">";
		}
		if(this.homedef.duri_pat && desc_uri.match(this.homedef.duri_pat)){
			is_home_uri = this.sub_resource_query(desc_uri, qparam);
		}else if(this.homedef.workuri_pat && desc_uri.match(this.homedef.workuri_pat)){
			is_home_uri = true;
		}
		qparam.query = qparam.text;
		rparam.desc_uri = desc_uri;
		return is_home_uri;
	};
	/**
	 * setup standard query parameters
	 * @param {String} qyery	query string
	 * @param {Object} qparam	query parameter
	 * @param {Object} rparam	results parameter
	 */
	this.set_query_param = function(qyery, qparam, rparam){
		rparam.resultTitle = 'SPARQL results:',
		qparam.text = qyery;
		qparam.query = this._getPrefixes() + qparam.text;
	};
	/**
	 * original snorql browse/classses/properties query handler moved here
	 * used through "Browse" section in snorql HTML which is deleted in this distribution, but works OK w/o it
	 * @param {Object} qparam	query parameter
	 * @return {String}	heading label
	 */
	this.original_class_prop_query = function(qparam){
		var matched = qparam.urlstring.match(/browse=([^&]*)/),
		resultTitle;
		qparam.text = null;
		if(matched) switch(matched[1]){
		case 'superclasses':
			resultTitle = 'List of all super classes:';
			qparam.text = 'SELECT DISTINCT ?class\n' +
				'WHERE { [] rdfs:subClassOf ?class }\n' +
				'ORDER BY ?class';
			qparam.query = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' + qparam.text;
			break;
		case 'classes':
			resultTitle = 'List of all classes:';
			qparam.query = 'SELECT DISTINCT ?class\n' +
				'WHERE { [] a ?class }\n' +
				'ORDER BY ?class';
			break;
		case 'properties':
			resultTitle = 'List of all properties:';
			qparam.query = 'SELECT DISTINCT ?property\n' +
				'WHERE { [] ?property [] }\n' +
				'ORDER BY ?property';
			break;
		case 'graphs':
			resultTitle = 'List of all named graphs:';
			qparam.text = 'SELECT DISTINCT ?namedgraph ?label\n' +
				'WHERE {\n' +
				'  GRAPH ?namedgraph { ?s ?p ?o }\n' +
				'  OPTIONAL { ?namedgraph rdfs:label ?label }\n' +
				'}\n' +
				'ORDER BY ?namedgraph';
			qparam.query = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' + qparam.text;
		}
		else if((matched = qparam.urlstring.match(/property=([^&]*)/))){
			resultTitle = 'All uses of property ' + decodeURIComponent(matched[1]) + ':';
			qparam.query = 'SELECT DISTINCT ?resource ?value\n' +
				'WHERE { ?resource <' + decodeURIComponent(matched[1]) + '> ?value }\n' +
				'ORDER BY ?resource ?value';
		}
		else if((matched = qparam.urlstring.match(/class=([^&]*)/))){
			resultTitle = 'All instances of class ' + decodeURIComponent(matched[1]) + ':';
			qparam.query = 'SELECT DISTINCT ?instance\n' +
				'WHERE { ?instance a <' + decodeURIComponent(matched[1]) + '> }\n' +
				'ORDER BY ?instance';
		}
		if(!qparam.text) qparam.text = qparam.query;
		return resultTitle;
	};
	
	
	/**
	 * prepare default (sample) query in textarea
	 * @param {Object} qparam	query parameter
	 * @param {Object} rparam	results parameter
	 * @return {Boolean}	true if query text presents
	 */
	this.prepare_default = function(qparam, rparam){
		if(qparam.text){
			//request with a query/describe etc
			rparam.ressec.style.display = "block";
			this.set_qform_text(qparam.text);
			this.displayBusyMessage();
			return true;
		}else{
			//w/o query = startup
			this.set_qform_text(this.default_query);
			if(!rparam.ressec) return false;
			//intro of this snorql service (snorql_jdb.js extension. intro parts can be customized in Snorqldef)
			if(Util.intro) Util.intro(this.homedef, rparam.ressec, this._endpoint);	//2020-06-03
			else rparam.ressec.style.display = "none";
			return false;
		}
	};
	/**
	 * setup query parameters based on query type
	 * @param {Object} qparam	query parameter
	 * @param {Object} rparam	results parameter
	 */
	this.set_qtype_params = function(qparam, rparam){
		// AndyL changed MIME type and success callback depending on query form...
		var that = this,
		exp = /^\s*(?:PREFIX\s+\w*:\s+<[^>]*>\s*)*(\w+)\s*.*/i,
		matched = exp.exec(qparam.text),
		qtype = matched ? matched[1].toUpperCase() : "";
		this.qtype = qtype;
		//if(Util.query_preamble) qparam.query = Util.query_preamble(qparam.query, qtype);
		if(Util.queries) qparam.query = Util.queries.preamble(qparam.query, qtype, this.homedef.is_virtuoso);
		switch(qtype){
		case 'ASK':
			qparam.output = 'boolean';
			qparam.successFunc = function(value){
				that.displayBooleanResult(value, rparam.resultTitle);
			};
			break;
		case 'CONSTRUCT':
		case 'DESCRIBE':
			if(JsonRDFFormatter){
				//@@ modified 2018-12-08
				var jrdf = new JsonRDFFormatter(this, rparam.desc_uri, rparam.is_home_uri);
				this.jrdf = jrdf; //debug
				qparam.successFunc = function(model){
					jrdf.display_result(model, rparam.resultTitle, qtype);
				};
			}else{
				qparam.output = 'rdf'; // !json
				qparam.successFunc = function(model){
					that.displayRDFResult(model, rparam.resultTitle);
				};
			}
			if(!this.homedef.is_virtuoso) qparam.accept = "application/rdf+json,jsonapplication/json";
			break;
		default:
			//SELECT query
			qparam.accept = true;
			qparam.output = "json";
			qparam.successFunc = function(json){
				that.displayJSONResult(json, rparam.resultTitle);
			};
		}
	};
	/**
	 * set up SPARQL query service. can be used by multiple instance of Snorql 2019-04-29
	 * @param {String} query	SPARQL query
	 * @param {Object} successFunc	function to execute on success
	 * @param {String|Boolean} accept	HTTP accept request header or false
	 * @param {String} output	result format to ask to the endpoint
	 */
	this.set_service = function(query, successFunc, accept, output){
		var that = this,
		service = new SPARQL.Service(this._endpoint);
		// removed here: if(this._graph)
		service.setMethod("GET");
		if(accept){
			var mime = (accept === true ? "application/sparql-results+json" : accept) + ",*/*";
			service.setRequestHeader("Accept", mime);
		}
		if(output) service.setOutput(output);
		service.query(query, {
			success: successFunc,
			failure: function(report){
				var message = report.responseText.match(/<pre>([\s\S]*)<\/pre>/);
				if(message){
					that.displayErrorMessage(message[1]);
				} else {
					that.displayErrorMessage(report.responseText);
				}
			}
		});
	};

	/**
	 * initialize variables and settings
	 * @param {Object} pfxtext	false if no pfxtext display area
	 */
	this.init = function(pfxtext){
		this.setBrowserBase(document.location.href.replace(/\?.*/, ''));
		//nspfx to uri mapping is defined as D2R_namespacePrefixes in namespaces.js
		this.setNamespaces(D2R_namespacePrefixes, pfxtext);
		this.use_title = true;	//to set title element. set false if use snorql for partial display
		
		//@@added 2018-12-13, modified from null to {}, it should be at least empty object 2021-02-09
		this.homedef = Snorqldef ? this.init_homedef() : {};
		if(!this.homedef.uri) this.homedef.uri = this._poweredByLink;
		this.homedef.homens_pat = new RegExp("^" + this.homedef.uri);
		//can add more ns to display as QName other than default _namespaces. 2021-02-21
		this.qname_ns = this.more_ns ? Object.assign(this.more_ns, this._namespaces) : this._namespaces;
		
		this.link_img = this.relpath + (this.link_img || 'link.png');	//2019-01-20
		this.elts = this.init_elts();
		if(Util.init) Util.init(this.homedef, this.elts);
		
		///additionally mover from start() 2021-02-13
		//this._enableNamedGraphs = false;
		// original TODO: Extract a QueryType class
		var uqparam = this.parse_url_qparam();
		if(uqparam.endpoint){
			if(!this._endpoint) this._endpoint = uqparam.endpoint;
			this.qp_endpoint = "&endpoint=" + uqparam.endpoint;
		}else if(!this._endpoint){
			if(document.location.href.match(/^([^?]*)snorql/)) this._endpoint = RegExp.$1 + "sparql";
		}
		this.uqparam = uqparam;
		//moved setBrowserBase to init() 
		this._displayEndpointURL(this.homedef.label || null);
		this._displayPoweredBy();
		//this.updateOutputMode();
	};
	//@@ extensions by ldb //////////////////////////////////////////////////////////////
	//// initializer
	/**
	 * setup based on Snorqldef
	 * @return {Object} object for this.home
	 */
	this.init_homedef = function(){
		var homedef;
		//@@added for flexible customization. Can declare any variable in other place
		//valid Snorqldef must have vars object
		if(Snorqldef.vars) this.init_vars(this, Snorqldef.vars);
		//additionally, Snorqldef can have a home object for special treatment
		if(!(homedef = Snorqldef.home)) return {};
		//therefore, homedef (=this.home) has all Snorqldef.home properties, plus bellow:
		homedef.is_virtuoso = homedef.endpoint_type === "virtuoso";	//for Util.queries.preamble 2021-02-09
		//if(homedef.datauri) homedef.datauri_len = homedef.datauri.length; //not used anywhere
		//uri patters to decide whether the target is_home_uri
		if(homedef.datauri_pat) homedef.duri_pat = new RegExp(homedef.datauri_pat);
		if(homedef.data_frags) homedef.dfrag_pat = new RegExp("^(.*)#(" + homedef.data_frags.join("|") + ")$");
		if(homedef.datauri_rplace) homedef.duri_rplace = homedef.datauri_rplace; //array
		if(homedef.workuri){
			homedef.workuri_pat = new RegExp("^(" + homedef.workuri.join("|") + ")");
		}
		if(homedef.default_lang) Util.default_lang = homedef.default_lang;
		if(homedef.submit_label){
			var lang = Util.ualang ? (Util.ualang === Util.default_lang ? 0 : 1) : 0,
			btn = document.querySelector(homedef.submit_selector);
			if(btn) btn.value = " " + homedef.submit_label[lang] + " ";
		}
		//homedef.relpath is deprecated in favor of vars.relpath if need to override default
		Util.datauri = homedef.datauri;
		if(homedef.label === false) homedef.label = "";
		else if(!homedef.label) homedef.label = this._poweredByLabel;
		Util.homelabel =  homedef.label;
		if(homedef.img && homedef.img.link) this.link_img = homedef.img.link;
		return homedef;	//to be this.home
		//if no def.home, this.homedef was initialized as {} at init();
	};
	//assign global vars, with ids as nested vars
	this.init_vars = function(target, source){
		for(var key in source){
			if(key === "ids") this.init_vars(target.ids, source.ids);
			else target[key] = source[key];
		}
	};
	this.init_elts = function(){
		var elts = {};
		for(var key in this.ids){
			if(!this.ids[key]) elts[key] = null;
			else elts[key] = document.getElementById(this.ids[key]);
		}
		return elts;
	};
	this.parse_url_qparam = function(){
		if(!location.search) return {};
		var param = {};
		location.search.substring(1).split("&").forEach(function(kv){
			var r = kv.split("=");
			param[r[0]] = r[1];
		});
		return param;
	};
	//// start() sub methods
	/**
	 * initialize ldb extensions
	 * @param {String} qyery	query string
	 * @param {Object} qparam	query parameter
	 */
	this.prepare_extension = function(qparam, rparam){
		if(Util.example){
			var m;
			if(!qparam.urlstring && (m = location.hash.match(/#ex=(\d+)/))) rparam.presel = Number(m[1]);
			Util.example.prepare(this.ids.qtxt, rparam.presel);
		}
		// no graph related
		//@@ easysql 2018-12-08
		if(EasySPARQL){
			if(!(new EasySPARQL(this._namespaces, 200).doit(this._endpoint, qparam))) return false;
			if(qparam.query) rparam.resultTitle = "EasySPARQL results:";
			if(qparam.endpoint) this._endpoint = qparam.endpoint;
		}
		return true;
	};
	/**
	 * special treatment to describe subresourece. called from set_desc_param if matches datauri_pat
	 * as a separate function and extended 2021-02-09
	 * @param {String} desc_uri	target uri to describe (which matches datauri_pat)
	 * @param {Object} qparam	query parameter
	 * @return {Boolean}	true if the target uri is in this store
	 */
	this.sub_resource_query = function(desc_uri, qparam){
		var is_home_uri,
		dfrag,
		dfrag_pat,
		drepl;
		//homedef object was set in init_homedef from Snorqldef.home
		if((dfrag = this.homedef.data_frags)){
			//if fragment pattern to add base describe query. note this method is called only when uri matches datauri_pat
			if(! desc_uri.match(/#/)){
				dfrag.forEach(function(frag){
				//if target uri has no fragment, add each frag uri to query
					qparam.text += "\n\t<" + desc_uri + "#" + frag + ">";
				});
			}else if((dfrag_pat = this.homedef.dfrag_pat) && (matched = desc_uri.match(dfrag_pat))){
				//if target uri has a frag (defined in dfrag_pat), then include body uri (without frag)
				qparam.text += "\n\t<" + matched[1] + ">";
				dfrag.forEach(function(frag){
					if(matched[2] !== frag) qparam.text += "\n\t<" + matched[1] + "#" + frag + ">";
				});
			//}else if(desc_uri.match(this.homedef.homens_pat)){
			//	is_home_uri = true;
			}
			is_home_uri = true;
			
		}else if((drepl = this.homedef.duri_replace)){
			//if variant uris to add base describe query, with array of replace definition. 2021-02-09
			drepl.forEach(function(rdef){
				//replace definition = {from: pat, to: replace}
				var newuri = desc_uri.replace(new RegExp(rdef.from), rdef.to);
				if(newuri !== desc_uri) qparam.text += "\n\t<" + newuri + ">";
			});
			is_home_uri = true;
			
		}else{
			//a poor assumption: the target is_home_uri iif no fragment presents in case no data_frags defined. to be improved
			if(! desc_uri.match(/#/)) is_home_uri = true;
			else is_home_uri = null;
		}
		return is_home_uri;
	};
	/**
	 * set query form textarea, and CMEditor if presents
	 * @param {String} querytext	query text
	 */
	this.set_qform_text = function(querytext){
		if(!this.elts.qtxt) return;
		this.elts.qtxt.value = querytext;
		if(CMEditor) CMEditor.setValue(querytext);	//@@ CodeMirror support 2018-12-09
	};
	
	//removed unsure extension query_select 2021-02-14 (generalized select query processor 2019-04-27)

	
	//@@ helper functions (original, w/ some extensions) //////////////////////////////////////////
	this.setBrowserBase = function(url){
		this._browserBase = url;
	};

	this._displayEndpointURL = function(label){
		//@@modified 2018-12-08
		var newTitle = "Snorql" + (label ? " for " + label : ": Exploring " + this._endpoint);
		this._display(document.createTextNode(newTitle), 'title');
		document.title = newTitle;
	};

	this._displayPoweredBy = function(){
		if(!this.elts.pwrdby) return;
		//removed dependencies on prototype.js
		this.elts.pwrdby.href = this._poweredByLink;
		this.elts.pwrdby.innerText = this._poweredByLabel;
	};

	this.setNamespaces = function(namespaces, pfxtext){
		this._namespaces = namespaces;
		if(pfxtext !== false) this._display(document.createTextNode(this._getPrefixes()), 'prefixestext');
	};
	
	//removed here: switchToGraph, switchToDefaultGraph, _updateGraph, updateOutputMode, resetQuery

	//called from HTML form button (onclick)
	this.submitQuery = function(){
		var mode = this._selectedOutputMode();
		if(CMEditor) this.elts.qtxt.value = CMEditor.getValue();	//@@ CodeMirror support 2018-12-09
		if(mode === 'browse' || mode === ""){
			this.elts.qform.action = this._browserBase;
			this.elts.qinput.value = this.elts.qtxt.value;
		} else {
			this.elts.qinput.value = this._getPrefixes() + this.elts.qtxt.value;
			this.elts.qform.action = this._endpoint;
			//2019-04-03, changed from jsonoutput to actualoutput;
			this.elts.qaout.disabled = false;
			this.elts.qaout.value = mode;
		}
		//document.getElementById('jsonoutput').disabled = (mode !== 'json');
	   /* deleted xslt check */
		this.elts.qform.submit();
	};

	this.displayBusyMessage = function(){
		var busy = document.createElement('div');
		busy.className = 'busy';
		busy.appendChild(document.createTextNode('Executing query ... '));
		this._display(busy, this.ids.res_div);
	};

	this.displayErrorMessage = function(message){
		var pre = document.createElement('pre');
		try{
			pre.innerHTML = message;
		}catch(e){
			//in case XHTML environment and ill-formed XML message
			console.warn(e.message);
			pre.innerText = message;
		}
		this._display(pre, this.ids.res_div);
	};

	////@@ display query results
	//display ASK query results
	this.displayBooleanResult = function(value, resultTitle){
		var div = document.createElement('div');
		var title = document.createElement('h2');
		title.appendChild(document.createTextNode(resultTitle));
		div.appendChild(title);
		if(value)
			div.appendChild(document.createTextNode("TRUE"));
		else
			div.appendChild(document.createTextNode("FALSE"));
		this._display(div, this.ids.res_div);
	};
	//legacy formatter for non JSON results
	this.displayRDFResult = function(model, resultTitle){
		var div = document.createElement('div');
		var title = document.createElement('h2');
		title.appendChild(document.createTextNode(resultTitle));
		div.appendChild(title);
		div.appendChild(new RDFXMLFormatter(model));
		this._display(div, this.ids.res_div);
		//this._updateGraph(this._graph); // refresh links in new result - necessary for boolean?
	};
	/**
	 * display SPARQL JSON results + header title
	 * @param {Object} json	SPARQL result json
	 * @param {String} resultTitle	label to describe the result
	 */
	this.displayJSONResult = function(json, resultTitle){
		var div = document.createElement('div');
		var title = document.createElement('h2');
		title.appendChild(document.createTextNode(resultTitle));
		div.appendChild(title);
		this.setup_json_result(json, div);
		this._display(div, "result");
	};
	/**
	 * generalized method to display SPARQL JSON results 2019-04-29
	 * @param {Object} json	SPARQL result json
	 * @param {DOMNode} div	element to append result table
	 */
	this.setup_json_result = function(json, div){
		//@@added error check 2018-12-09
		if(!json){
			this.__msg(div, "[query error: no response]", "p") ;
		}else if(json.status && json.status === "error"){
			this.__msg(div, "ajax error: " + json.response , "pre") ;
			console.log(json);
		}else if(json.head && json.head.status === "error"){
			this.__msg(div, "query status error: " + json.head.msg , "pre") ;
		}else if(json.results.bindings.length === 0){
			this.__msg(div, "[no result]", "p") ;
		}else {
			if(SPARQLSelectTableFormatter){
				//@@modified 2018-12-12
				this.sstf = new SPARQLSelectTableFormatter(json, this._namespaces, this);
				this.sstf.toDOM(div);
			}else{
				div.appendChild(new SPARQLResultFormatter(json, this._namespaces, this).toDOM());
			}
		}
	};
	//@@2018-12-09
	this.__msg = function(div, msg, elt){
		var p = document.createElement(elt);
		p.className = 'empty';
		p.appendChild(document.createTextNode(msg));
		div.appendChild(p);
		//@@added 2018-12-14
		if(this.use_title)
		document.title = this.qtype + " " + msg + " - Snorql"
		+ (this.homedef.label ? " for " + this.homedef.label : "");
	};

	this._display = function(node, whereID){
		var where = document.getElementById(whereID);
		if(!where){
			console.log('ID not found: ' + whereID);
			return;
		}
		while (where.firstChild){
			where.removeChild(where.firstChild);
		}
		if(node === null) return;
		where.appendChild(node);
	};

	this._selectedOutputMode = function(){
		return this.elts.qoutsel.value;
	};

	this._getPrefixes = function(){
		var prefix, prefixes = '';
		for(prefix in this._namespaces){
			var uri = this._namespaces[prefix];
			prefixes = prefixes + 'PREFIX ' + prefix + ': <' + uri + '>\n';
		}
		return prefixes;
	};

	this._betterUnescape = function(s){
		//return unescape(s.replace(/\+/g, ' '));
		//@@modified 2018-12-07
		return decodeURIComponent(s.replace(/\+/g, ' '));
	};

}


/*
 * RDFXMLFormatter
 * 
 * maybe improve...
 */
function RDFXMLFormatter(string){
	var pre = document.createElement('pre');
	pre.appendChild(document.createTextNode(string));
	return pre;
}


/*
===========================================================================
SPARQLResultFormatter: Renders a SPARQL/JSON result set into an HTML table.

var namespaces = { 'xsd': '', 'foaf': 'http://xmlns.com/foaf/0.1' };
var formatter = new SPARQLResultFormatter(json, namespaces);
var var app = Snorql object;
*/
function SPARQLResultFormatter(json, namespaces, app){
	if(json){	//@@added in order to call without result json (from other formatter)
		this._json = json;
		this._variables = this._json.head.vars;
		this._results = this._json.results.bindings;
	}
	this._namespaces = namespaces;
	this.app = app;	//2019-01-20 points to Snorql
	this.target_uris = [];	//save subject (assumed) URIs for later use
	this.has_countvar = false;	//test to assign query template to literal var 2020-04-18

	this.toDOM = function(){
		var table = document.createElement('table');
		table.className = 'queryresults';
		table.appendChild(this._createTableHeader());
		for(var i = 0; i < this._results.length; i++){
			table.appendChild(this._createTableRow(this._results[i], i));
		}
		return table;
	};

	// TODO: Refactor; non-standard link makers should be passed into the class by the caller
	this._getLinkMaker = function(varName, qname){
		var that = this;
		if(varName === 'property'){
			//added app.qp_endpoint but would not work with non snorql endpoint
			return function(uri) { return '?property=' + encodeURIComponent(uri) + that.app.qp_endpoint; };
		} else if(varName === 'class'){
			return function(uri) { return '?class=' + encodeURIComponent(uri) + that.app.qp_endpoint; };
		} else if(varName === '_replace' && Util.queries){
			//@@2018-12-13
			Util.queries.vars = this._variables;
			return function(uri) { return Util.queries.replace_q(uri) + that.app.qp_endpoint;; };
		} else if(varName.match(/^(thumb(nail)?|image)$/) && Util.queries && !this.app.qp_endpoint){
			//@@2018-12-13/2019-05-07
			var descuri = this.current_subj_uri ? this._uri_describer(this.current_subj_uri) : null;
			return function(uri) { return Util.queries.image_q(uri, descuri); };
		} else {
			//2019-02-28 -> 2019-05-07 add "?describe="
			return function(uri){return that._uri_describer(uri); };
		}
	};
	//use different describer specified in Snorqldef.describer_map
	this._uri_describer = function(uri){
		if(!Snorqldef) return uri;	//if no Snorqldef extension, simply return the requested value
		//if "any endpoint" mode, return describe query
		if(this.app.qp_endpoint) return "?query=describe+<" + encodeURIComponent(uri) + ">" + this.app.qp_endpoint;
		//for snorql endpoint
		var resuri = "?describe=" + encodeURIComponent(uri),
		map = Snorqldef.describer_map;	//null if not defined
		if(map) for(var key in map){
			if(uri.match(map[key])){
				resuri = key + resuri;
				break;
			}
		}
		return resuri;
	};

	this._createTableHeader = function(){
		var tr = document.createElement('tr');
		var hasNamedGraph = false;
		for(var i = 0; i < this._variables.length; i++){
			var th = document.createElement('th');
			th.appendChild(document.createTextNode(this._variables[i]));
			tr.appendChild(th);
			if(this._variables[i] === 'namedgraph'){
				hasNamedGraph = true;
			}
			else if(this._variables[i] === 'image' && Util.cls_toggler){
				//toggle to expand thumbnail 2019-12-20
				th.addEventListener("click", function(){
					Util.cls_toggler(this.parentNode.parentNode, "expandimg");
				});
				th.className = "toggler";
			}
			else if(this._variables[i] === "count"){
				this.has_countvar = i;
			}
		}
		if(hasNamedGraph){
			var th = document.createElement('th');
			th.appendChild(document.createTextNode(' '));
			tr.insertBefore(th, tr.firstChild);
		}
		return tr;
	};

	this._createTableRow = function(binding, rowNumber){
		var tr = document.createElement('tr');
		if(rowNumber % 2){
			tr.className = 'odd';
		} else {
			tr.className = 'even';
		}
		this.current_subj_uri = null;	//@@2019-04-29
		var namedGraph = null;
		var numvars = this._variables.length;	//@@added 2018-12-07
		for(var i = 0; i < numvars; i++){
			var varName = this._variables[i];
			var td = document.createElement('td');
			//@@modified 2018-12-07
			var node = binding[varName];
			if(!node){
				//2020-07-05
				//if(rowNumber === 0) console.warn("no binding for", varName, "at column", i); //in case wrong select var name
				tr.appendChild(td);
				continue;
			}
			if(i===0){
				//mark this link can be replaced as a query URI
				if(numvars <= 6 && this._variables.slice(1).includes("count")){
					node.o_varname = varName;
					varName = "_replace";	//allows count in any positon rather than this._variables[1]==="count" 2020-06-18. See Util.queries.replace_q
				}
				//save subject (assumed) URIs of all results.
				if(!node) console.warn("binding for '" + this._variables[i] + "' not found.");	//mistype of varname, e.g. kwy for key
				else if(node.type === "uri") this.target_uris.push(node.value);
			}
			var nodeval = this._formatNode(node, varName, numvars, i);
			td.appendChild(nodeval);
			if(nodeval.className === "unbound") td.className = "unbound";
			tr.appendChild(td);
			if(this._variables[i] === 'namedgraph'){
				namedGraph = binding[varName];
			}
		}
		if(namedGraph){
			var link = document.createElement('a');
			link.href = 'javascript:snorql.switchToGraph(\'' + namedGraph.value + '\')';
			link.appendChild(document.createTextNode('Switch'));
			var td = document.createElement('td');
			td.appendChild(link);
			tr.insertBefore(td, tr.firstChild);
		}
		return tr;
	};

	this._formatNode = function(node, varName, numvars, varpos){
		if(!node){
			return this._formatUnbound(node, varName);
		}
		if(node.type === 'uri'){
			return this._formatURI(node, varName, numvars);
		}
		if(node.type === 'bnode'){
			return this._formatBlankNode(node, varName);
		}
		if(node.type === 'literal'){
			var nval = node.datatype ? this._formatTypedLiteral(node, varName) : this._formatPlainLiteral(node, varName, varpos);
			if(varName === "_replace" && Util.queries){
				//literal aggregation key can also be expanded
				var q = Util.queries.add_pseudo_qlink(nval, node.value);
			}
			return nval;
		}
		if(node.type === 'typed-literal'){
			return this._formatTypedLiteral(node, varName);
		}
		return document.createTextNode('???');
	};

	this._formatURI = function(node, varName, numvars, dlinkoption, is_direct_link){
		//@@added 3rd, 4th arg: variable length (=column count), no direct link flag 2018-12-10
		//dlinkoption can be false e.g. for property cell of JsonRDFFormatter.format_one_prop()
		var qname = this._toQName(node.value),
		link = this._getLinkMaker(varName, qname)(node.value);	//, this
		if(varName.match(/^(ur[il]|s|cho)$/)) this.current_subj_uri = node.value;	//@@2019-04-29
		if(typeof(link) === "object") return link;
		var span = document.createElement('span');
		//span.className = 'uri';
		var a = document.createElement('a'),
		atitle = qname ? node.value : "",	//"description of "
		m;	//for match
		span.appendChild(a);
		if(dlinkoption === false){
			//i.e. property cell
			//atitle_pfx = "";
			//if(!qname) qname = this._toQName(node.value, this.app.more_ns);	//more_ns is merged to qname_ns 2021-02-21
			if(!atitle) atitle = node.value;	//added full uri as title 2020-09-02
			a.classList.add("prop");
			if(this.app.homedef.prop_describe_link) a.href = link;	//if property cell should have a descr link. 2021-02-28
		}else if((m = node.value.match(/^(https?|ftp|urn):/))){
			if(is_direct_link && !qname){
				atitle = "direct link to this resource";
				a.href = node.value.replace(/\+/g, "%2B");
				a.classList.add("dlink");
			}else{
				a.href = link;
				//urn can have a describe link but no external link. 2021-03-02
				if(m[1] !== "urn") this.set_external_link(span, node.value, dlinkoption);
			}
		}
		//'<' and '>' are delegated to CSS so as not to be included when copy table 2019-04-29
		if(atitle) a.title = atitle;
		//a.className = 'graph-link';
		this.set_uri_elt(a, node, qname, numvars);
		//show actual URI by ctrl+click
		a.addEventListener("click", function(ev){
			if(ev.getModifierState("Control")){
				Util.url_ctrl_disp(node, ev);
				ev.preventDefault();
				return false;
			}
		});
		if(varName === "_replace" && Util.queries){
			a.title = "query resources where ?" + node.o_varname + " replaced by this value. Shift+click to describe it.";
			a.addEventListener("click", function(ev){
				if(ev.getModifierState("Shift")){
					location.href = "?describe=" + encodeURIComponent(node.value);
					ev.preventDefault();
					return false;
				}
			});
		}
		return span;
	};
	
	this.set_uri_elt = function(elt, node, qname, numvars){
		if(qname){
			elt.classList.add("qname");
			elt.innerText = qname;
		}else {
			//@@modified 2018-12-08 to trim long URI for display purpose
			Util.url_disp(elt, node.value, numvars);
			elt.classList.add("uri");
		}
	};
	this.set_external_link = function(span, node_value, dlinkoption){
		//if(!node.value.match(/^(https?|ftp):/)) return;
		//@@ added dlinkoption condition in order not to add direct link for property cell
		var externalLink = document.createElement('a');
		externalLink.href = node_value;
		externalLink.className = "extlink";
		var img = document.createElement('img');
		img.src = this.app.link_img;	//if link_img location is different, set Snorqldef.vars.relpath in snorql_def.js 2019-08-16
		img.alt = "";
		img.title = "to this URI itself";
		externalLink.appendChild(img);
		span.appendChild(externalLink);
		if(Util.link_modifier && (typeof(dlinkoption)==="string")){
			//changed dlinkoption behavior to modifier option 2020-03-16
			Util.link_modifier(externalLink, node_value + dlinkoption);
		}
	};

	this._formatPlainLiteral = function(node, varName, varpos){
		//@@varpos to test to apply replace_q for literal (failed 2020-04-18)
		//@@2018-12-09 added node.lang
		var span = document.createElement('span'), lang;
		span.textContent = node.value.replace(/\\n/g, "\n");;
		span.className = "literal";
		//quotes and @lang are delegated to CSS for copy 2019-04-29
		if((lang = node['xml:lang'] || node.lang)){
			span.setAttribute("data-lang", lang);
		}
		return span;
	};

	this._formatTypedLiteral = function(node, varName){
		var span = document.createElement('span');
		//String() for xsd:decimal, integer 2020-03-22
		span.textContent = String(node.value).replace(/\\n/g, "\n");;
		//quotes and ^^datatype are delegated to CSS for copy 2019-04-29
		if(node.datatype){
			var datatype = this._toQNameOrURI(node.datatype);
			if(this._isNumericXSDType(node.datatype)){
				span.setAttribute("title", datatype);
				span.className = "number";
			}else if(datatype === "xsd:string"){
				span.setAttribute("title", datatype);
				span.className = "literal";
			}else{
				span.setAttribute("data-dtype", datatype);
				span.className = "literal";
			}
		}else{
			span.className = "literal";
		}
		return span;
	};

	this._formatBlankNode = function(node, varName){
		return document.createTextNode('_:' + node.value);
	};

	this._formatUnbound = function(node, varName){
		var span = document.createElement('span');
		span.className = 'unbound';
		span.title = 'Unbound';
		span.appendChild(document.createTextNode('-'));
		return span;
	};
	
	//added ns param to resolve with other (additional) namespaces def
	this._toQName = function(uri, ns){
		if(!ns) ns = this.app.qname_ns;	//= this._namespaces + this.more_ns; 2021-02-21
		for(var prefix in ns){
			var nsURI = ns[prefix];
			if(uri.indexOf(nsURI) === 0){
				//added length condition to avoid prefix only 2020-03-23
				return uri.length > nsURI.length ? prefix + ':' + uri.substring(nsURI.length) : null;
			}
		}
		return null;
	};

	this._toQNameOrURI = function(uri){
		var qName = this._toQName(uri);
		return (qName === null) ? '<' + uri + '>' : qName;
	};

	this._isNumericXSDType = function(datatypeURI){
		for(var i = 0; i < this._numericXSDTypes.length; i++){
			if(datatypeURI === this._xsdNamespace + this._numericXSDTypes[i]){
				return true;
			}
		}
		return false;
	};
	this._xsdNamespace = 'http://www.w3.org/2001/XMLSchema#';
	this._numericXSDTypes = ['long', 'decimal', 'float', 'double', 'int',
		'short', 'byte', 'integer', 'nonPositiveInteger', 'negativeInteger',
		'nonNegativeInteger', 'positiveInteger', 'unsignedLong',
		'unsignedInt', 'unsignedShort', 'unsignedByte'];
}
/*
 * RDFXMLFormatter
 * 
 * maybe improve...
 */
function RDFXMLFormatter(string){
	var pre = document.createElement('pre');
	pre.appendChild(document.createTextNode(string));
	return pre;
}

(function(){
	//Util is to be defined in snorql_ldb.js
	if(Util) return; //will not override if snorql_ldb.js is loaded first
	//this is the minimum Util functions used in this snorql.js, just in case of stand-alone (no snorql_ldb.js)
	else Util = {
		url_disp: function(elt, str){elt.innerText = str;},
		url_ctrl_disp: function(node, ev){prompt("value URI", node.value);}
	};
})();