//Snorql plugin
"use strict";
var _sldb_version = "v2.04";
var Snorqldef, SPARQL, L, CMEditor;
////@@ DESCRIBE query result handler /////////////////////////////////////////

/** JavaScript port plus of Linked Data Browser (masaka)
 * extention of Snorql.displayRDFResult (displays DESCRIBE/CONSTRUCT results)
 * created 2018-12-08
 * modified 2021-05-08
 * @param {Object} snorql	calling object, i.e. instance of Snorql class
 * @param {String} target_uri	URI of the described resource (value of describe)
 * @param {String} is_home_uri	flag to indicate the uri to describe is a resource in this triple store
 */
var JsonRDFFormatter = function(snorql, target_uri, is_home_uri){
	var that = this,
	homedef = snorql.homedef,	//snorql.homedef contains all Snorqldef.home plus some props for snorql. {} if not provided.
	snqdef = Snorqldef ? Snorqldef : {},
	ldbdef = snqdef.ldb;
	this.ldbdef = ldbdef || {};	//different from Snorqldef.ldb, this.ldbdef can use test e.g. if(this.ldbdef.aproperty)
	/// short cut for snorql globals
	this.snorql = snorql;
	this.ns = snorql._namespaces;
	this.endpoint = snorql._endpoint;
	this.is_virtuoso = homedef.is_virtuoso;	//2021-02-09 for later_table
	this.sq_formatter = new SPARQLResultFormatter(null, this.ns, snorql);	//reuse _formatNode
	
	/// basic global vars (uri related)
	this.uris ={
		tgrsrc: target_uri || "",	//target resource URI for SPARQL describe
		primary: target_uri || "",	//primary uri to process in this.format. usually same as tgrsrc. see the case askex ndla
		img: [],	//could be multiple
		thumb: null,
		home: homedef.uri,	//base uri of resources in the endpoint. set to _poweredByLink at snorql.init() if not provided
		proced: []	//URIs already processed to format a table
	};
	this.is_home_uri = is_home_uri;	//whether the target is home resource's uri of this endpoint
	this.has_target_resource = undefined;	//make sure result has target URI resource
	
	/// basic global vars (value holders)
	this.rdfjson = null;	//RDF/JSON (Talis) = object {uri1 : {p1: [o1, o2...], p2: ...}, uri2: ...}
	this.title = null;
	this.thmub_tb = null,	//tbody that contains thumbnail info
	this.rdftype = "";	//local name of rdf:type of the current object
	this.rdftype_more = "";	//2nd rdf:type, e.g. Person in case of Agent 2021-01-18
	this.category = "";	//local name of schema:category of the current object, if any
	this.saved = {rdfjson:[]};	//hold anything that could be referred later
	this.ovtds = {};	//key=object URI, value=td nodes of the URI (to add a label etc. async) 2020-08-25
	this.proptds = {};	//key=property URI, value=td nodes of the property (to add a label etc. async) 2021-02-27
	this.media_types = {};	//register rdf:type of schema:url and schema:associatedMedia
	this.num_label_cand = 0;	//counter of non-literal resources. used to decide whether fetch ext labels
	
	/// some predefined values
	this.exserv = null;
	this.relpath = snorql.relpath;	//"" if not set in Snorqldef
	this.img = homedef.img;
	this.langidx = Util.langidx,	//,Util.ualang === "ja" ? 0 : 1;
	this.dlink_props = [];	//props to treat value as direct link
	this.xplabeluri = "urn:x-proplabels",	//extra label property uri (pseudo uri for construct) 2020-06-25
	this.xplabels = null;	//holds xplabeluri resources if later query returns values for the uri
	this.pdesc = snqdef.prop_description || {};	//description of some (app specific) properties for tool tips, if any
	if(ldbdef){
		//if ldb, provide values for those predef props
		setup_ldbspecific(ldbdef);
		//whether to fetch rdfs:label by addex.labels(). if set to "+prop", then also fetch property labels
		this.exlabel = {
			fetch: is_home_uri === true ? ldbdef.fetch_label : false,
			lang_filter: ldbdef.label_lang_filter ||
			"OPTIONAL {?s <" + this.ns.schema + "name> ?en . FILTER(lang(?en)=\"en\")}",	//use schema:name label@en for other lang if available	
			union : ldbdef.label_union || function(uri){return "UNION {<" + uri + "> ?p [?q ?s]}";},
			more_cond: ldbdef.label_more_cond || function(){return ""}
		};
	}else{
		//otherwise, leave them undefined
		this.props = {dist:{}, typeinfo:[]};
		this.geo = {prop: {}, strctprop: {}, valprop: {}};
		this.link_sfx = null;
		this.propclass = {};
		this.acsinfo = {};
		this.showrows = 4;
		this.exlabel = {
			fetch_label: is_home_uri === true,
			lang_filter: "",
			union: function(){return ""},
			more_cond: function(){return ""}
		};
		if(!Snorqldef) Snorql = {ldb: null};	//Util expects Snorql.ldb to be either null or actual object, not an empty object. See this.ldbdef comment, which is set to {} if no Snorql.ldb defined.
	}
	
	//for NDC (nippon dicimal classification) display
	this.ndc = {prop: this.ns.schema + "about"};
	for(var i=0; i<10; i++) this.ndc[i] = [];
	/// some functions / reg exp
	this.objv_sort = function(a, b){return (a.value < b.value) ? -1 : 1; }; //sort by object value
	this.description_sort = ldbdef ? define_descr_sort() : this.objv_sort;
	if(this.link_sfx) this.link_sfx.forEach(function(def){
		def.len = def.ns.length;
	});
	this.relmatch_pat = new RegExp("^" + this.ns.skos + "(exact|close|related)Match$");	//@@expects skos ns def
	
	//instantiate associated classes
	this.qh = new GnrQueryHandler(this);
	this.addex = new AddExtraInfo(this);
	this.askex = new AskExternal(this, snqdef.askex);
	//uris that does not treat as direct link even if it is a value of dlink_props
	var non_dlink_uris = Object.keys(this.askex.pat2proc);
	if(homedef.desc_uripats) non_dlink_uris = non_dlink_uris.concat(homedef.desc_uripats);
	this.non_dlink_pat = new RegExp("^(" + non_dlink_uris.join("|") + ")");
	
	////////// local procedures
	// assign predifined values for ldb
	function setup_ldbspecific(ldbdef){
		that.props ={
			"label": set_uri(ldbdef.label_prop),	//that.ns.rdfs + "label";
			"img": set_uri(ldbdef.img_prop),
			"thumb": set_uri(ldbdef.thumb_prop),
			"dist": {},	//describe in sub table
			"typeinfo": []	//add type info to the value resource
		};
		//setup "describe in sub table" properties defined in snorql_def
		if(ldbdef.dist_props) for(var prop in ldbdef.dist_props){
			that.props.dist[set_uri(prop)] = new RegExp(ldbdef.dist_props[prop].replace("%home%", that.uris.home));
		}
		//properties whose values will be treated as direct external links, rather than describe=value
		if(ldbdef.dlink_props)
		ldbdef.dlink_props.forEach(function(pdef){that.dlink_props.push(set_uri(pdef));});
		//setup "add type info" properties defined in snorql_def
		if(ldbdef.type_info_props)
		ldbdef.type_info_props.forEach(function(pdef){that.props.typeinfo.push(set_uri(pdef));});
		//geo related properties
		that.geo = {
			prop: {
				geo: set_uri(ldbdef.geo.prop),	//schema:geo
				strct: set_uri(ldbdef.geo.strctprop),	//jps:spatial
				region : set_uri(ldbdef.geo.regionprop),	//jps:region
				val : set_uri(ldbdef.geo.valprop),	//jps:value
				loc: set_uri(ldbdef.geo.locprop),	//schema:location
				lat: set_uri("schema:latitude"),
				long: set_uri("schema:longitude"),
				cover: set_uri("schema:geoCoveredBy"),
				within: set_uri("jps:within")
			},
			cover_obj: {},
			procd_subj: [],
			candcount: 0,
			cand_subj: [],
			cand: {
				ap: [], //access provider
				cs: [],	//content/creator specific
				es: [],	//entity (GLAM) specific
				pr: [], //publication with region
				cj: [],	//content/creator simply Japan (or America)
				gl: [] //generic location
			},
			candreg: {},	//register each cand with its subject as key
			pseudop: {lat: "lat of coveredBy", long: "long of coveredBy"} //{lat: "(latitude)", long: "(longitude)"},
		};
		//access info holder
		that.acsinfo = {
			pprop: set_uri("jps:accessInfo"),
			prvprop: set_uri("schema:provider"),
			provider: []
		};
		that.exserv = ldbdef.texternal ? Util.misc.rset(ldbdef.texternal, 32) : null;
		var iiifv = ldbdef.use_iiif_viewer;
		if(iiifv){
			that.use_iiif_viewer = true;
			Util.iiif.viewer = (typeof(iiifv)==="string" ? iiifv : "https://purl.org/net/iiif/viewer") +
			"?" + (ldbdef.iiif_manifest_param || "manifest") + "=";
		}
		that.link_sfx = ldbdef.link_sfx;	//suffix mapping for external links
		//propety based class attribute
		that.propclass = ldbdef.propclass || {};
		//preferred order of properties
		if(ldbdef.proporder){
			var actions = {showup: "unshift", showdown: "push"};
			that.proporder = {};
			for(var type in actions){
				that.proporder[actions[type]] = [];
				ldbdef.proporder[type].forEach(function(map){
					that.proporder[actions[type]].push(set_uri(map));
				});
			}
		}
		that.showrows = ldbdef.showrows || 4;
	}
	//descriptionソートのための正規表現。unicode非対応ブラウザも
	function define_descr_sort(){
		var dsort_re = RegExp.prototype.hasOwnProperty("unicode") ? 
			new RegExp("\\p{sc=Kana}", "u") : new RegExp("^(アクセス|サービス)");
		//descriptionの場合、カタカナ導入句を後ろに
		return function (a, b){
			if(a.value.match(dsort_re)){
				if(b.value.match(dsort_re)) return (a.value < b.value) ? -1 : 1; else return 1;
			}else if(b.value.match(dsort_re)) return -1;
			else return (a.value < b.value) ? -1 : 1;
		};
	}
	//constructs a uri from [nspfx, localname] array
	function set_uri(qname){
		var nslocal = qname.split(":");
		return (snorql._namespaces[nslocal[0]] || "") + nslocal[1];
	}
};

//////functions of JsonRDFFormatter
JsonRDFFormatter.prototype = {
	////@@ basic processes
    /** display DESCRIBE/ CONSTRUCT results (JSON), called from snorql
     * @param {Object} json	SPARQL results in JSON format
     * @param {String} heading	heading in the result display section
     * @param {String} qtype	query type
     */
    display_result: function(json, heading, qtype){
		var that = this,
		div =document.getElementById("result");	//use #result itself, not append a new child div
		//error handling
		if(!json){
			this.__msg(div, "[query error: no response]", "p");
			return;
		}else if(json.status && json.status === "error"){
			this.snorql.__msg(div, "ajax error: " + json.response , "pre");
			return;
		}else if(json.head && json.head.status === "error"){
			this.snorql.__msg(div, "query error: " + json.head.msg , "pre");
			return;
		}
		//prepare heading
		var that = this,
    	h2 = Util.dom.element("h2");
		h2.appendChild(Util.dom.text(heading));
		this.snorql._display(h2, "result");	//not append, but replace a message <p> with h2
    	if(qtype === "DESCRIBE") this.addex.test_external_link(h2);
		if(json.results && json.results.bindings.length === 0) return no_res_message(div, qtype);
		this.div_descr = div;
		var subdiv = this.proc_json(json, div);
		Util.set_title(this, qtype);
		//changed to call labels asynchronously 2020-08-25
    	if(this.exlabel.fetch){
    		//fetch labels iif non literal values present
    		if(this.num_label_cand) this.addex.labels(this.uris.tgrsrc);
    		//fetch labels of prop names if desired, eg NCR. 2021-02-27
    		if(this.exlabel.fetch === "+prop") this.addex.prop_labels();
    	}
		this.addex.ncname_hint(div, subdiv, this.uris.tgrsrc);
    	
    	function no_res_message(div, qtype){
			//resource not in RDF store is not a fail
			//display h2 (w/ link to URI) and try to find if it is object(s) of any other resource
			that.snorql.__msg(div, "[no result for " + qtype + " query]", "p");
			if(qtype === "DESCRIBE"){
				that.addex.ncname_hint(div, null, that.uris.tgrsrc);
				that.askex.proc(div);
				var msgarea = Util.dom.element("p");
				div.appendChild(msgarea);
				that.addex.osp(div, msgarea);
			}
			return false;
    	}
		//moved function proc_json and find_best_geo to independent method proc_json
	},
	/**
	 * processes the results set json
	 * @param {Object} json	SPARQL results in JSON format
	 * @param {DOMNode} div	element node that has the description table
	 * @return {DOMNode}	sub div element node that directly has the description table
	 */
	proc_json: function(json, div){
		this.rdfjson = json.results ? this.toRDFJson(json) : json;
		var subdiv = this.format();
		div.appendChild(subdiv);
		if(this.geo.candcount){
			//to fetch geo. See one_object() in format_one_prop for direct geo properties
			var that = this, cand = this.find_best_geo();
			//if(cand) cand.otd.appendChild(that.addex.geo_table(cand.val, cand.lprop, true, cand.subj));
			if(cand) this.addex.geo_table(cand.otd, cand.val, cand.lprop, true);	//, cand.subj
			this.geo.candcount--;
		};
		if(this.addex.primimg_plus(div)) div.classList.add("with_pimg");
		else if(this.rdftype === "和歌" || this.category === "和歌") Util.waka.show(this, div, "和歌");
		else if(this.category === "俳句") Util.waka.show(this, div, "俳句");
		//title search for item (excluding dictionary entities) 2020-03-28
		if(this.rdftype && !this.rdftype.match(/^\w/)) this.addex.title_more_search(this.rdftype);
		//2020-04-04, 2020-04-19
		this.askex.proc(div);
		//2019-02-11
		this.addex.set_osp_btn(div);
		return subdiv;
	
		//function find_best_geo moved to this.find_best_geo
	},
	//proc() is replaced by (merged to) proc_json
	//toRDFJson and binds2rdf moved to JSON format conversion section
	
	/**
	 * generates description table from RDF/JSON
	 * @param {DOMNode} div	element node that has the description table
	 * @return {DOMNode}	div element node that has the description table
	 */
	format: function(div){
		if(!div) div = Util.dom.element("div");
		//var div = Util.dom.element("div");
		var uris = Object.keys(this.rdfjson);	//order of uris is not the same as keys in this.rdfjson
		if(this.uris.tgrsrc) uris = this.confirm_tgsrc(uris);
		//xplabeluri is special uri to represent prop labels and to be constructed by query e.g. ask_wikidata
		if(this.rdfjson[this.xplabeluri]) this.xplabels = this.rdfjson[this.xplabeluri];	//2020-06-25
		uris.forEach(function(uri){
			if(uri === this.xplabeluri) return;	//xplabeluri resources are handled at proc_one_object()
			if(this.uris.proced.indexOf(uri) !== -1) return;	//avoid outside table wikidata link 2020-09-13
			var tbl = this.format_one_uri(uri);
			if(tbl) div.appendChild(tbl);
			//test
			if(uri.match(new RegExp("^http://purl.org/net/ns/ext/nt#kbgj-(\\d+)-(\\d+)$"))){
				this.uris.img.push("https://kunishitei.bunka.go.jp/bsys/photo/" + RegExp.$1 + "_P"
				+ (RegExp.$2 < 150 ? (RegExp.$2 + "000000000") : ("00000000" + RegExp.$2).slice(-8))
				+ "01.jpg");
			}
		}, this);
		return div;
	},

	////@@ handles one subject URI
	/**
	 * format a table for one URI
	 * @param {String} uri	subject URI of the resource to process
	 * @param {String} pprop	parent property URI of the current resource (undefined if top level)
	 * @param {String} ppqname	QName of the parent property (undefined if top level)
	 * @param {DOMNode} table	table element to setup prop-vals for this uri. only provided from add_later_table
	 * @return {DOMNode}	table element node that describes one resource
	 */
	format_one_uri: function(uri, pprop, ppqname, table){
		//console.log(uri, pprop, table);
		if(this.uris.proced.indexOf(uri) !== -1){
			//uri already processed
			return this.sq_formatter._formatURI({value: uri, type: "uri"}, "o", 2);
		}
		var po = this.rdfjson[uri];	//property:object of this URI
		if(!po) return null;	//in case reques uri has extension and rdf not
		if(!table){
			table = Util.dom.element("table");
			this.set_table_caption(table, uri, pprop);
			this.uris.proced.push(uri);	//avoid re-format for nested URI
		}
		table = Util.dom.prepare_desc_table(table);
		//parent objects
		var pa = {
			"prop": pprop,
			"table": table,
			"pdescr": pprop ? (this.pdesc[ppqname + "_g"] || {}) : this.pdesc
		},
		ttype = "";	//rdftype of the item described in this table
		var geopo, coverpo;
		if((coverpo = po[this.geo.prop.cover]) && (geopo = po[this.geo.prop.geo])){
			//coverprop should be evalueted here because geo and nested props will be processed first in forEach
			this.geo.cover_obj[geopo[0].value] = coverpo;
		}
		//for each property of subject URI
		this.order_props(po).forEach(function(p){
			if(p === this.ns.rdf + "rest") return;
			else if(p === this.ns.rdf + "first") table.appendChild(this.proc_rdf_list(po));
			else{
				var tbody = this.format_one_prop(po, {"prop": p, "subj": uri}, pa);
				table.appendChild(tbody);
				if(!ttype) ttype = tbody.getAttribute("data-type") || ""; //null;
			}
		}, this);
		add_microdata(this);
		return table;
		
		//test to add microdata
		function add_microdata(that){
			//find appropriate itemtype for microdata
			var itemid, schematype;
			if(pprop){
				//disabled in favor of flat microdata structure
				schematype = ttype.match(/^[A-Z]/) ? ttype : "";
			}else{
				itemid = uri;
				schematype = that.rdftype.match(/^[A-Z]/) ? that.rdftype : "CreativeWork";
				table.setAttribute("itemid", itemid);
			}
			if(schematype){
				table.setAttribute("itemscope", "");
				table.setAttribute("itemtype", "http://schema.org/" + schematype);
				if(schematype === "Place") table.setAttribute("itemprop", "location");
			}
		}
	},

	////@@ hendles one propety of a subject URI
	/**
	 * process one property (multiple object values)
	 * @param {Object} po	property-object set of current resource
	 * @param {Object} sp	{subj: subject URI of this property, prop: property to process}
	 * @param {Object} pa	parent objects {prop: parent property URI of the current resource (null if top level), 
	 	table: ancestor table to append result tbody (to check has_map etc.)}
	 * @return {DOMNode}	tbody element node that group up description of this property
	 */
	format_one_prop: function(po, sp, pa){
		if(!po[sp.prop]) console.log(sp.subj, sp.prop, po);
		//RDF objects array of this property-object set
		var that = this,
		objs = po[sp.prop].sort((sp.prop === this.ns.schema + "description") ? this.description_sort : this.objv_sort),
		tbody = Util.dom.element("tbody"),
		params = {
			numobj: objs.length,	//object count of this array
			pclass: null,	//HTML class attr for this property
			pqname: this.sq_formatter._toQName(sp.prop)	//QName of the property
		};
		//HTML tbody element to group up rows for this property
		//hilite agential, temporal, spatial
		if((params.pclass = this.propclass[params.pqname])){
			tbody.className = params.pclass + " ats";	//agential, temporal, spatial
			if(params.pclass === "type"){
				find_rdftype(objs[0].value);
				//test to add microdata
				if(pa.prop) tbody.setAttribute("data-type", this.rdftype);
			}
		}else if(sp.prop === this.props.label){
			this.title = objs[0].value;
			tbody.className = "label";
		}else if(sp.prop === this.props.img){
			//register all images
			objs.forEach(function(o){this.uris.img.push(o.value);}, this);
		}else if(sp.prop === this.props.thumb){
			//use only the first thumbnail if multiple present
			this.uris.thumb = objs[0].value;
			this.thmub_tb = tbody;
			tbody.className = "thumb";
		}else if(sp.prop === this.geo.prop.cover || sp.prop === this.geo.prop.within){
			//this.geo.covering_obj = objs;
			this.geo.cover_obj[sp.subj] = objs;
		}
		if(sp.subj === objs[0].value && this.uris.proced.indexOf(sp.subj) !== -1){
			//loop error in nested uri (which was already formatted)
			console.warn("same subj, obj", sp.subj, "for", sp.prop);
			return tbody;
		}
		pa.ancestor_table = pa.table.parentNode ? pa.table.parentNode.closest("table") : null;
		//processes each object of this property
		objs.forEach(function(myobj, i){
			sp.obj = myobj;	//add obj to sp so that proc_one_object can use it as spo
			var ovtd = this.proc_one_object(i, po, sp, pa, tbody, params);
		}, this);
		if(tbody.toggler) tbody.toggler.click();
		return tbody;
		
		//objectのvalueを用いて並べ替える
		function obj_value_sort(a, b){
			return (a.value < b.value) ? -1 : 1;
		}
		//descriptionの場合、カタカナ導入句を後ろに
		function description_sort(a, b){
			if(a.value.match(that.dsort_re)){
				if(b.value.match(that.dsort_re)) return (a.value < b.value) ? -1 : 1; else return 1;
			}else if(b.value.match(that.dsort_re)) return -1;
			else return (a.value < b.value) ? -1 : 1;
		}
		function find_rdftype(val){
			if(!that.rdftype){
				that.rdftype = Util.uri.split(val, true);
			}else{
				that.rdftype_more = Util.uri.split(val, true);
			}
		}
	},

	////@@ hendles one object value of a s-p
	/**
	 * process one object value. separated from format_one_prop 2020-05-27
	 * @param {Integer} i	object position
	 * @param {Object} po	property-object set of current resource
	 * @param {Object} spo	{subj: subject URI of this property, prop: property to process, obj: current target object}
	 * @param {Object} pa	parent objects {prop: parent property URI of the current resource (null if top level), 
	 	table: ancestor table to append result tbody (to check has_map etc.),
	 	ancestor_table: closest parent of pa.table or null}
	 * @param {DOMNode}	tbody element node for current property
	 * @param {Object} params	some values from format_one_prop
	 */
	proc_one_object: function(i, po, spo, pa, tbody, params){
		var row = Util.dom.element("tr"),	//HTML tr element to include this one prop-obj pair
		optd = Util.dom.element("td"),	//object property td = HTML td element for property
		myoval = spo.obj.value,	//value of current one object
		is_nonliteral = spo.obj.type !== "literal";
		//property cell (td)
		if(i === 0){
			//property cell is generated only for the first value
			var pv = spo.prop.match(/^http/) ? this.sq_formatter._formatURI({"value": spo.prop}, "p", 1, false) :
				Util.dom.element("span", spo.prop),	//pseudo prop for coveredBy lat/long
			pdescr = pa.pdescr[params.pqname];
			pv.firstChild.addEventListener("click", function(ev){
				//Control + click is defined at snorql.js to show URI (prompt)
				if(ev.getModifierState("Shift")) location.href = "?describe=" + encodeURIComponent(this.getAttribute("title"));
			});
			optd.appendChild(pv);
			if(params.numobj > 1){
				optd.setAttribute("rowspan", params.numobj);
				//test to add row toggler 2019-04-28
				if(params.numobj > this.showrows + 1) tbody.toggler = this.add_toggler(optd, params.numobj);
			}
			if(pdescr) optd.title = pdescr[this.langidx];
			if(this.xplabels && this.xplabels[spo.prop]){
				//add a label to propety: ask_wikidata() results for now 2020-06-25
				optd.appendChild(this.set_wrapper_content(this.xplabels[spo.prop][0].value));
			}else{
				//test for property labels 2021-02-27
				if(!this.proptds[spo.prop]) this.proptds[spo.prop] = [];
				this.proptds[spo.prop].push(optd);
			}
		}else{
			//no show, but need for CSS :nth-child
			optd.className = "repeated";
		}
		row.appendChild(optd);
		
		//value cell (td)
		var ovtd = Util.dom.element("td"),	//object value td = HTML td element for property value
		ovtd_val = this.set_object_tdval(spo.obj, spo.prop, spo.subj, params.pqname, params, tbody);
		if(ovtd_val && ovtd_val.parent_has_map){
			pa.table.has_map = true;	//signal from map not yet on DOM tree
		}else if(tbody.has_map){
			pa.table.parent_has_map = true;	//one more step further
		}
		if(!this.ovtds[myoval]) this.ovtds[myoval] = [];
	
		//add microdata 2020-02-13
		if(params.pqname) set_microdata_prop(ovtd);
		if(ovtd_val){
			//odtv could be an array, eg a geohash URI and a map table
			if(ovtd_val instanceof Array){
				if(is_nonliteral) this.ovtds[myoval].push(ovtd[0]);
				ovtd_val.forEach(function(ov){ovtd.appendChild(ov);});
			}else{
				if(is_nonliteral) this.ovtds[myoval].push(ovtd);
				ovtd.appendChild(ovtd_val);
			}
			if(params.extraval){
				ovtd.appendChild(params.extraval);
				params.extraval = null;	//クリアしておかないと後続のtdにどんどん付け替えられる
			}
			row.appendChild(ovtd);
			tbody.appendChild(row);
		}
		//property test (mostly geo related, but also license description). note property is also tested in set_object_tdval()
		this.more_on_property(i, po, spo, pa, ovtd, myoval);
		//return ovtd;
		
		//setup refined microdata 2020-02-26
		function set_microdata_prop(otd){
			var pqm, mdprop;	//prop qname match, microdata prop
			if(!(pqm = params.pqname.match(/^(schema|jps):(.+)/))) return;
			if(pqm[1] === "schema"){
				mdprop = pqm[2] === "relatedLink" ? "url" : pqm[2];
				if(pqm[2] === "latitude") tbody.setAttribute("data-type", "Place");
			}else if(pqm[1] === "jps"){
				mdprop = pqm[2].match(/^(agenti|spati|tempor)al/) ? "disambiguatingDescription" : "";
			}
			if(mdprop){
				otd.setAttribute("itemprop", mdprop);
				if(mdprop === "provider"){
					otd.setAttribute("itemscope", "");
					otd.setAttribute("itemtype", "http://schema.org/Organization");
				}
			}
		}
		
	},

	/**
	 * setup the td element of the object, according to its type or property
	 * @param {Object} obj	one RDF object to process
	 * @param {String} prop	property URI of this object
	 * @param {String} subj	subject URI of this object
	 * @param {String} pqname	QName of the property
	 * @param {Object} params	wapper object to return extraval as its prop
	 * @param {DOMNode} tbody	ancestor tbody element
	 * @return {DOMNode|Array}	(array of) DOM node to be the content of the td element for this object
	 */
	set_object_tdval: function(obj, prop, subj, pqname, params, tbody){
		var stype;
		if(obj.type === "literal" || obj.type === "typed-literal"){
			var span = this.sq_formatter._formatNode(obj, "o");
			if(obj.value.length > 1000) span.classList.add("scl");
			if(pqname === "schema:description") Util.hilite(span);
			return span;
		}else if(this.rdfjson[obj.value]){
			this.num_label_cand++;	//count number of non-literal result values
			//URI that is also a subject in this graph
			if(!this.is_home_uri) return this.format_one_uri(obj.value, prop, pqname) ;
			
			//special for home resource
			var po = this.rdfjson[obj.value],	//Resources of this URI
			keys = Object.keys(po);
			//not call to this.set_label_wrapper hrere 2020-08-25
			//not to further process when more proc e.g. ask_wikidata to avoid arbitrary labels 2020-06-25
			if(this.is_home_uri === "ask_wikidata") this.uris.proced.push(obj.value);	//ensure _formatURI on format_one_uri
			var span = this.format_one_uri(obj.value, prop, pqname);
			if(obj.value.match(/http:\/\/(ja\.)?dbpedia\.org\/resource\/(.*)/) && typeof(this.is_home_uri) !== "string")
				this.addex.wikipedia_link(span, RegExp.$1, RegExp.$2);
			return span;
		}else if(prop === this.geo.prop.geo){
			//this.geo.count++;
			tbody.has_map = true;
			return [
				this.sq_formatter._formatURI(obj, "o", 2),	//render actual geo prop value as normal URI
				this.addex.gen_geo_table(obj.value)	//then add further lat/long etc and a map
			];
		}else if(obj.type === "bnode"){
			//not in rdfjson means no further nest values
			var span = Util.dom.element("span", "structured values not fetched "),
			anc = Util.dom.element("a", "(see subject URI for more)");
			anc.href = "?describe=" + subj;
			span.className = "structbnode";
			span.appendChild(anc);
			return span;
		}else{
			//external URI
			this.num_label_cand++;
			var sfxoption;
			if(this.link_sfx) this.link_sfx.forEach(function(def){
				//eg. add geohash parameter
				if(obj.value.substr(0, def.len) === def.ns){
					sfxoption = def.sfx;
					return;
				}
			});
			var is_dlink = (this.dlink_props.includes(prop) && !obj.value.match(this.non_dlink_pat)),	//this.askex.map_pat
			span = this.sq_formatter._formatURI(obj, "o", 2, sfxoption, is_dlink);
			//add more info for IIIF etc
			if(obj.value.match(/\/(manifest.?(\.json)?|info\.json)$/) && this.use_iiif_viewer){
				this.addex.iiif_link(span, obj.value);
			}else if(obj.value === "http://iiif.io/api/presentation/2#Manifest" && prop === (this.ns.rdf + "type")){
				this.addex.iiif_link(span, subj);
			}else if((prop === this.ns.schema + "isPartOf") &&
				(stype = this.rdfjson[subj][this.ns.rdf + "type"]) &&
				stype[0].value === "http://iiif.io/api/presentation/2#Canvas"
			){
				this.addex.iiif_link(span, obj.value, subj);
			}else if(obj.value.match(/\/canvas\/.*/)){
				this.addex.test_iiif(span, obj.value);
				
				
			}else if(this.props.typeinfo.includes(prop)){
				//add type info for a media url, and schema:url val which not handled by askex.proc
				this.addex.test_url_type(span, obj.value);
				
			}else if(this.props.dist[prop] && obj.value.match(this.props.dist[prop])){
				//indirect description 2020-09-03
				params.extraval = this.addex.desciption_sub_table(obj.value, tbody);
				
			}else if(obj.value.match(new RegExp("^" + this.uris.tgrsrc + "#"))){
				//indirect description 2020-09-03
				//simple append results in a table inside a span
				params.extraval = this.addex.desciption_sub_table(obj.value, tbody);
				
			}else if(prop === this.ndc.prop && obj.value.match(/ndc\d?[#\/]((\d)[\d\.]+)/)){
				//NDC
				this.ndc[RegExp.$2].push(RegExp.$1);
				
			}else if(obj.value.match(/http:\/\/(ja\.)?dbpedia\.org\/resource\/(.*)/)){
				//wikipadia (dbpedia)
				this.addex.wikipedia_link(span, RegExp.$1, RegExp.$2);
			}
			return span;
		}
	},
	/**
	 * add more info besed on current/parent property (mostly geo related, but also license description)
	 * property is tested at ancestor format_one_prop once for a property. this method is activated for each property value
	 * @param {Integer} i	object position
	 * @param {Object} po	property-object set of current resource
	 * @param {Object} spo	{subj: subject URI of this property, prop: property to process, obj: current target object}
	 * @param {Object} pa	parent objects {prop: parent property URI of the current resource (null if top level), 
	 	table: ancestor table to append result tbody (to check has_map etc.),
	 	ancestor_table: closest parent of pa.table or null}
	 * @param {Object} ovtd	object value td = HTML td element for property value
	 * @param {Object} myoval	value of current one object
	 */
	more_on_property: function(i, po, spo, pa, ovtd, myoval){
		var geo_tested = false;
		switch(spo.prop){
		case this.ns.schema + "latitude":
			if(pa.ancestor_table && pa.ancestor_table.has_map) break;
			//if there is a geocoordinate --> direct geo or fetched result.
			//See proc_json() in display_result for fetched geo
			var coverobj = this.geo.cover_obj[spo.subj] || po[this.geo.prop.cover] || po[this.geo.prop.within] || null,
			hash = coverobj ? Util.uri.split(coverobj[0].value, true) : null,
			msubj = spo.subj.match(/geohash\.org\/(.+)$/);
			//hash length is the precision of the wihin region = one level heigher than the place
			//if not region geo, or precision is better than prefecture level
			this.geo.procd_subj.push(spo.subj);
			//show a map
			Util.map.setup(ovtd, myoval, po, this.ns, this.rdftype, hash, msubj ? msubj[1] : null);
			//to avoid redundant map in one spatial table
			if(pa.ancestor_table) pa.ancestor_table.has_map = true;
			else pa.table.parent_has_map = true;	//pa.table not yet attached to the DOM tree
			geo_tested = true;
			break;
			
		case this.geo.prop.cover:
			if(!po[this.geo.pseudop.lat] || pa.table.has_map) break;
			//gerCoveredBy of indirect ref to location
			var hashm = myoval.match(/geohash\.org\/(.+)$/),
			pseudopo = {lat: po[this.geo.pseudop.lat], long: po[this.geo.pseudop.long]};
			Util.map.setup(ovtd, null, pseudopo, this.ns, this.rdftype, hashm[1]);
			pa.table.has_map = true;
			geo_tested = true;
			break;
			
		case this.geo.prop.loc:
			//if geolocation node itself
			this.prep_geo_cand(ovtd, po, spo.subj, {"prop": spo.prop, "subj":null}, true);
			geo_tested = true;
			break;
			
		case this.acsinfo.prvprop:
			if(pa.prop !== this.acsinfo.pprop) break;
			//access provider
			this.prep_geo_cand(ovtd, po, myoval, spo, true);
			this.acsinfo.provider.push(myoval);
			break;
			
		case this.ns.schema + "abstract":
			if(!this.askex.rstypes.includes(this.rdftype)) break;
			//excerpts of abstract for licese description
			ovtd.appendChild(Util.dom.element("a", "(read full on the original page)", [["href", spo.subj]]));
			break;
			
		case this.ns.schema + "license":
			this.addex.if_indiv_policy(ovtd, myoval);
			break;
			
		case this.ns.schema + "category":
			this.category = Util.uri.split(spo.obj.value, true);
			break;
		}
		if(!geo_tested && pa.prop === this.geo.prop.strct && i===0){
			//if a spatial node (i.e. parent prop == jps:spatial) found, save info for possible map disp
			if(spo.prop === this.geo.prop.region) this.prep_geo_cand(ovtd, po, myoval, spo, false);
			else if(spo.prop === this.geo.prop.val) this.prep_geo_cand(ovtd, po, myoval, spo, false);
			else if(spo.prop === this.snorql._namespaces.rdfs + "seeAlso") this.prep_geo_cand(ovtd, po, myoval, spo, true);
		}
	},
	/**
	 * proc RDF List as flat table (not nested ones) A:called from format_one_uri or B:nested call 2019-04-29
	 * @param {Object} po	property object list of the current node of the list
	 * @param {DOMNode} tbody	tbody to append tr for this list node | undefined if A
	 * @param {Integer} pos	position in the list (1 base) | undefined if A
	 * @param {String} bnid	bnode ID of the list node | undefined if A
	 * @return {DOMNode}	tbody element with each list node as tr/td if A
	 */
	proc_rdf_list: function(po, tbody, pos, bnid){
		if(!tbody){
			//case A
			tbody = Util.dom.element("tbody");
			pos = 1;
		}else{
			//case B
			this.uris.proced.push(bnid);	//avoid re-format for nested URI
		}
		var tr = Util.dom.element("tr"),
		tdnum = Util.dom.element("td", "(" + pos + ")"),
		tdval = Util.dom.element("td"),
		first = po[this.ns.rdf + "first"],
		rest = po[this.ns.rdf + "rest"];
		tdnum.className = "rdflist";
		if(!first || first.length === 0){
			//there must be only one rdf:first
			console.warn("ill-formed RDF List, no rdf:first in list node", pos, po);
			tdval.innerText = "(no rdf:first in list node)";
		}else{
			tdval.appendChild(this.set_object_tdval(first[0], this.ns.rdf + "first", bnid));
		}
		tr.appendChild(tdnum);
		tr.appendChild(tdval);
		tbody.appendChild(tr);
		if(first.length > 1){
			console.warn("ill-formed RDF List, more than one rdf:first", pos, po);
		}
		if(!rest || rest.length === 0){
			console.warn("ill-formed RDF List, no rdf:rest in list node", pos, po);
			return;
		}else if(rest[0].value === this.ns.rdf + "nil"){
			//normal end of the list
			return pos === 1 ? tbody : null;	//2020-06-29 added tbody
		}else if(rest.length > 1){
			console.warn("ill-formed RDF List, more than one rdf:rest", pos, po);
		}
		//nest process the next node
		this.proc_rdf_list(this.rdfjson[rest[0].value], tbody, pos + 1, rest[0].value);
		if(pos === 1) return tbody;
	},

	////@@ hendles geo/map related data
	/**
	 * save spatial relation for later map disp. See find_best_geo()
	 * @param {Object} otd	<td> element of the structured node
	 * @param {Array} po	property-obect set of the structured node
	 * @param {String} val	object value of geo property
	 * @param {Object} spo	{subj: subject URI/bNode Id of the node, prop: property of geo value}
	 * @param {Boolean} need_loc_prop	whether schema:location prop needed before schema:gen
	 */
	prep_geo_cand: function(otd, po, val, spo, need_loc_prop){
		if(this.geo.cand_subj.includes(spo.subj)){
			//if the subject is already processed (i.e. structured node was registered as cand) only add otd of this property
			this.geo.candreg[spo.subj].otds[spo.prop] = otd;
			return;
		}
		//the rest is processed only once per one structure node
		this.geo.cand_subj.push(spo.subj);
		var regionp = this.geo.prop.region,
		regionv = po[regionp] || null,
		thisv = regionv ? regionv[0].value : val,
		geov = po[this.geo.prop.geo] || null,	//if struct node has schema:geo
		within = po[this.geo.prop.within] || po[this.geo.prop.cover] || null,
		relv = po[this.ns.jps + "relationType"] || "",
		cand = {
			//prop is the heighest precision property in the structure nod
			"prop": geov ? this.geo.prop.geo : (regionv ? regionp : spo.prop),
			"value": thisv, 	//geo prop value
			"subj": spo.subj,	//subject of the prop (the node), or null if called from schema:location
			"rel": relv ? relv[0].value : "",	//relationType of the node
			"otds": {},	//<td> of the node
			"locprop": need_loc_prop ? this.geo.prop.loc : null	//schema:location
		};
		cand.otds[spo.prop] = otd;
		//try to use better precision
		if(within && spo.prop !== this.ns.jps + "region") cand.hash = Util.uri.split(within[0].value, true);
		//prioritize creation place
		var segment;
		if(relv && relv[0].value.match(/\/(制作|内容|採集)/)){
			segment = (val === this.ns.place + "日本" || val === this.ns.place + "アメリカ") ? "cj" : "cs";
		}else if(spo.prop === this.ns.rdfs + "seeAlso"){
			segment = "es";
		}else if(spo.prop === regionp){	//this.ns.jps + "region"
			segment = "pr";
		}else if(spo.prop === this.ns.schema + "provider"){
			segment = "ap";
		}else{
			segment = "gl";
		}
		//order by precision
		if(cand.hash && cand.hash.length >= 5) this.geo.cand[segment].unshift(cand);
		else this.geo.cand[segment].push(cand);
		this.geo.candreg[spo.subj] = cand;	//register cand by its subject in order to update the otds values
		this.geo.candcount++;
	},
	/**
	 * select geo object to add map from candidates prepared by prep_geo_cand. to be called from proc_json
	 * @return {Object}	contains otd, val, lprop, subj to be used in AddExtraInfo.geo_table
	 */
	find_best_geo: function(){
		//if no direct geo value found and has spatial value
		var cands = {val:[], lprop: [], otd: null}, seglen, csubj;
		for(var segment in this.geo.cand) if((seglen = this.geo.cand[segment].length)){
			var cseg = this.geo.cand[segment];
			if(segment === "ap"){
				//generate map for access provider immediately to leave cands for spatial nodes
				var cd = cseg[0];
				this.addex.geo_table(cd.otds[cd.prop], [cd.value], [cd.locprop], true);
				this.geo.candcount--;
				continue;
			}else for(var i=0; i<seglen; i++){
				if(this.geo.procd_subj.includes(cseg[i].subj)) continue;
				//if schema:geo exists, deligate to geo value node (otherwise redundant lat/long info presented)
				else if(cseg[i].prop === this.geo.prop.geo) continue;
				if(cands.val.length === 0){
					//first priority
					cands.val.push(cseg[i].value);
					cands.lprop.push(cseg[i].locprop);
					cands.otd = cseg[i].otds[cseg[i].prop];
					csubj = cseg[i].subj;
				}else if(cseg[i].subj === csubj){
					//add one more cand if same subj node
					cands.val.push(cseg[i].value);
					cands.lprop.push(cseg[i].locprop);
					return cands;
				}
			}
		}
		if(cands.val.length) return cands;
		//console.log("unkown segment in geo cand", this.geo.cand);
		return null;
	},
	

	////@@ JSON format conversion
	/**
	 * converts SPARQL result JSON to RDF/JSON (Talis)
	 * See https://www.w3.org/TR/rdf-json/ for RDF/JSON details
	 * @param {Object} json	SPARQL results in JSON format
	 * @return {Object}	RDF/JSON (Talis)
	 */
	toRDFJson: function(json){
		return this.is_virtuoso ? this.binds2rdf(json.results.bindings) : this.any2RDFJson(json);
	},
	/**
	 * actucal conversion from JSON query results bindings to RDF/JSON
	 * @param {array} bindings	JSON results array
	 * @return {Object}	converted RDF/JSON
	 */
	binds2rdf: function(bindings){
		var res = {};
		bindings.forEach(function(binding){
			var sv = binding.s.value,
			pv = binding.p.value,
			o = binding.o;
			if(o.type === "uri" && o.value.substr(0, 2) === "_:") o.type = "bnode";
			if(!res[sv]) res[sv] = {};
			if(!res[sv][pv]) res[sv][pv] = [];
			res[sv][pv].push(o);
		});
		return res;
	},
	/**
	 * in case resulting json has different name for SPO. 結果JSONのキーがs,p,oではなくsubject,predicate,objectであるタイプをRDF/JSONに変換する
	 * @param {Object} json	query result json from an endpoint
	 * @param {Boolean} ucvar	true if 1st char of bind variables are Uppercase
	 * @return {Object}	converted RDF/JSON
	 */
	wdToRDFJson: function(json, ucvar){
		var res = {},
		vars = ucvar ? {"s": "Subject", "p": "Predicate", "o": "Object"} :
			{"s": "subject", "p": "predicate", "o": "object"};
		json.results.bindings.forEach(function(binding){
			var sv = binding[vars["s"]].value,
			pv = binding[vars["p"]].value,
			o = binding[vars["o"]];
			if(o.type === "uri"){
				if(o.value.substr(0, 2) === "_:") o.type = "bnode";
				//Wikidata does URL-encode for JSP chnames
				if(o.value.match(/^https:\/\/jpsearch/)) o.value = decodeURIComponent(o.value);
			}
			if(!res[sv]) res[sv] = {};
			if(!res[sv][pv]) res[sv][pv] = [];
			res[sv][pv].push(o);
		});
		return res;
	},
	//find appropriate variables type and convert to RDF/Json
	any2RDFJson: function(json){
		if(json.head.vars.includes("subject")) return this.wdToRDFJson(json);
		else if(json.head.vars.includes("Subject")) return this.wdToRDFJson(json, true);
		else return this.binds2rdf(json.results.bindings);
	},
	////@@ misc utils
	
	/**
	 * add a table caption of described URI (only for non describe and non bnode)
	 * @param {DOMNode} table	the table to add a caption
	 * @param {String} uri	URI of a resource described in the table as a caption
	 * @param {String} pprop	parent property URI of the current resource (undefined if top level)
	 */
	set_table_caption: function(table, uri, pprop){
		if(!uri.match(/^_:/)){
			var caption = Util.dom.element("caption");
			//caption.appendChild(Util.dom.text(Util.str.trim(uri, 128, [60, 40])));
			//prepare caption only if the uri is not the target resource (which has own h2)
			//though if it is nested (has parent prop) it is assumed to be auth/entity in NDLA call
			if(uri !== this.uris.tgrsrc || pprop) caption.innerText = Util.str.trim(uri, 128, [60, 40]);
			table.appendChild(caption);
		}
	},

	//removed set_label_wrapper in favor of asynchronous addex.labels() at display_result() 2020-08-25
	/**
	 * set wrapper sub <span> element. also be used to show type of a resource (url)
	 * @param {String} val	value to be wrapped
	 * @return {DOMNode}	<span> element that contains original value
	 */
	set_wrapper_content: function(val){
		var label = Util.dom.element("span");
		label.appendChild(Util.dom.text(" (" + val + ")"));
		label.className = "subtext";
		return label;
	},
	/**
	 * change display order of properties
	 * @param {Object} po	JSON object of RDF prop-object set
	 * return {Array}	list of property in the order of processing
	 */
	order_props: function(po){
		var props = Object.keys(po).sort();
		if(this.proporder) for(var action in this.proporder){
			this.proporder[action].forEach(function(p){
				props = this.reorder_item(props, p, action);
			}, this);
		}
		return props;
	},
	/**
	 * re-order an array item
	 * @param {Array} items	array to re-order
	 * @param {String} element	the element of the array to move
	 * @param {String} action	unshift (move the key to first position) or pop (to the last position)
	 * @return {Array}	re-ordered array
	 */
	reorder_item: function(items, element, action){
		var pos;
		if((pos = items.indexOf(element)) !==-1){
			var trimed = items.splice(pos, 1);
			items[action](trimed[0]);
		}
		return items;
	},
	/**
	 * confirm the target resource URI and the order of process URI list
	 * @param {Array} uris	URI list to process (in this.rdfjson)
	 * @return {Array}	possibly re-ordered uri list
	 */
	confirm_tgsrc: function(uris){
		if(this.uris.tgrsrc.match(/^(.+)#(access|source)info$/) && this.rdfjson[RegExp.$1]){
			this.uris.tgrsrc = this.uris.primary = RegExp.$1;
		}
		if(!this.rdfjson[this.uris.tgrsrc]) return uris;
		if(!this.has_target_resource){
			uris = [this.uris.primary || this.uris.tgrsrc];	//only target uri should be processed as the top table 2020-03-02 --> primary uri 2021-03-02
			this.has_target_resource = true;
		}
		if(uris[0] !== this.uris.primary){
			//if primary uri (should be processed first in format) is not at the top of the array, reorder (eg. ndlna/entity)
			if(!uris.includes(this.uris.primary)) console.log("no primary uri", this.uris.primary, "in the set", uris);
			else this.reorder_item(uris, this.uris.primary, "unshift");
		}
		return uris;
	},
	
	/**
	 * add an icon image (as HTML tag) if available
	 * @param {String} imgid	image prop defined in this.img object
	 * @return {String}	HTML <img> tag
	 */
	img_elt_tag: function(imgid){
		return this.img ? "<img src=\"" + this.relpath + this.img[imgid] + "\"/>" : "";
	},
	/**
	 * 2019-04-28 expand/collapse multi rows of one property
	 * @param {Object} ptd	td element for property
	 * @param {Integer} nrows	number of rows for property values
	 */
	add_toggler: function(ptd, nrows){
		var that = this,
		delta = nrows - this.showrows,
		toggler = Util.dom.element("span", "hide " + delta + " in " + nrows);
		toggler.className = "toggler";
		toggler.addEventListener("click", function(ev){
			that.toggle_rows(ev.target, nrows);
		}, false);
		ptd.appendChild(toggler);
		return toggler;
	},
	/**
	 * toggler to expand/collapse multi rows of a property tbody
	 * @param {Object} o	target of a click event
	 * @param {Integer} nrows	number of rows for property values
	 */
	toggle_rows: function(o, nrows){
		var hidden,
		ptd = o.parentNode,
		tr = ptd.parentNode,
		delta = nrows - this.showrows,
		rpos = 1;
		if(o.innerText.match(/^…show/)){
			hidden = true;
			o.innerText = "hide " + delta + " in " + nrows;
			ptd.setAttribute("rowspan", nrows);
		}else{
			hidden = false;
			o.innerText = "…show all " + nrows;
			ptd.setAttribute("rowspan", this.showrows);
		}
		while((tr = tr.nextSibling)){
			if(!tr.tagName || tr.tagName.toLowerCase() !== "tr") continue;
			if(rpos++ < this.showrows) continue;
			if(hidden){
				tr.style.display='table-row';
			}else{
				tr.style.display='none';
			}
		}
	},
	/**
	 * setup sequential navigation (not used)
	 * @param {DOMNode} div	HTML element to add navigation
	 * @param {Array} seq_uri	[previous item uri, next item uri]
	 */
	set_seq_nav: function(div, seq_uri){
		if(seq_uri[0]) div.appendChild(newlink(seq_uri[0], "←"));
		if(seq_uri[1]) div.appendChild(newlink(seq_uri[1], "→"));
		function newlink(uri, text){
			var anc = Util.dom.element("a", text);
			anc.setAttribute("href", "?describe=" + uri);
			return anc;
		};
	}
};

/**
 * add extra info ascynchronously
 * @param {Object} jrdf	calling object, i.e. instance of JsonRDFFormatter
 */
var AddExtraInfo = function(jrdf){
	this.app = jrdf;
	this.snorql = jrdf.snorql;
	this.sq_formatter = jrdf.sq_formatter;
	this.uris = jrdf.uris;
	this.langidx = jrdf.langidx;
	this.ns = jrdf.ns;
	this.geo = jrdf.geo;
	this.qh = jrdf.qh;
};
//functions of AddExtraInfo
AddExtraInfo.prototype = {
	/////@@ additional information process
	/**
	 * add one image (thumbnail) to the div element, plus ISBN info
	 * @param {DOMNode} div	element node that has the description table
	 * @return {Boolean}	true if image element added
	 */
	primimg_plus: function(div){
		var url, m, isbn, ilen;
		if((ilen = this.uris.img.length)){
			//if associatedMedia found
			var that = this, useimg, thumb = this.uris.thumb;
			//select low resolution image in case multi images are available (dubbed with thumb as met, cleveland)2020-05-26
			if(Object.keys(this.app.media_types).length === 0){
				var sid = setInterval(function(){
					//console.log(that.app.media_types);
					if(Object.keys(that.app.media_types).length >= ilen){
						select_one_image(that.uris.img);;
						clearInterval(sid);
					}
				}, 200);
			}
			//if multiple cands (associatedMedias of different resolution)
			else select_one_image(this.uris.img);
			return true;
			
		}else if(this.uris.thumb){
			//thumbnail uri found
			this.prim_image_url(div, null, this.uris.thumb);
			return true;
			
		}else if((url = this.license_badge(this.uris.tgrsrc, "l"))){
			//test of cc logo for license description
			this.prim_image_url(div, null, url);
			return true;
			
		}else if(this.app.has_target_resource &&
			(isbn = this.app.rdfjson[this.uris.tgrsrc][this.ns.schema + "isbn"])
		){
			//a book
			this.img_plus_from_isbn(div, isbn[0].value);
			return true;
		}else return false;
		
		///local function to select the image to display. uses local vars
		function select_one_image(imguris){
			var candimg = [];
			for(var i=0; i<ilen; i++){
				var mtype = that.app.media_types[imguris[i]];
				if(mtype && !mtype.match(/(image|(jpe?g|png|gif|svg)$)/i)) continue;
				else if(mtype === null || imguris[i] === thumb){
					useimg = imguris[i];
					//console.log(useimg, mtype);
					break;
				}else candimg.push(imguris[i]);
			}
			if(!useimg){
				if(candimg[0]) useimg = candimg[0];
				else if(thumb) useimg = thumb;
				else return false;
			}
			if(useimg === thumb) thumb = null;
			that.prim_image_url(div, null, useimg, thumb);
		}
	},
	/**
	 * generates an image element and insert as the first child
	 * @param {DOMNode} div	element node that has the description table
	 * @param {Object} option	an object to pass extra parameters e.g. width, recover url
	 * @param {String} url	target image source url
	 * @param {String} recover_url	alternative image url to be used when the target url failed
	 * @return {DOMNode}	<img> element
	 */
	prim_image_url: function(div, option, url, recover_url){
		var figelt = Util.dom.element("figure"),
		imgelt = Util.dom.element("img");
		if(!option) option = {w:100, recover:recover_url};
		imgelt.src = url;
		figelt.className = "primimage";
		//in case if the url (associatedMedia) is a video etc, use thumbnail
		figelt.appendChild(imgelt);
		if(option.no_onerror){
			imgelt.title = "no image info in RDF";
			imgelt.classList.add("still");
		}else{
			Util.img.on_event(imgelt, option);
			figelt.appendChild(Util.img.range_ctrl(imgelt));
			if(option.title) imgelt.title = option.title;
			if(this.app.thmub_tb) this.img_search(this.app.thmub_tb.firstChild.firstChild);
		}
		div.insertBefore(figelt, div.firstChild);
		return imgelt;
	},
	/**
	 * try to get book cover image from ISBN, then add image elt if success. Also add bookinfo from the data
	 * @param {DOMNode} div	element node that has the description table
	 * @param {String} isbn	ISBN of the book to be described
	 */
	img_plus_from_isbn: function(div, isbn){
		var that = this;
		
		Util.xhr.get("https://api.openbd.jp/v1/get?isbn=" + isbn, function(res){
			if(!res || !res[0]) return no_isbn_img(false);
			that.app.saved.openbd = res[0];
			var url = res[0].summary.cover;
			that.bookinfo_from_isbn(res[0].onix, res[0].hanmoto);
			if(!url) return no_isbn_img(true);	//, res[0].summary
			that.prim_image_url(div, {which:"book", title:"Obtained via openBD API (not a part of RDF)"}, url);
		});
		//add calil link?
		function no_isbn_img(show_icon){
			if(!show_icon) div.classList.remove("with_pimg");
			else that.prim_image_url(div, {no_onerror:true}, Util.img.gen_icon("book"));
			return false;
		}
	},
	/**
	 * reuse ONIX/hanmoto data from openbd
	 * @param {Object} onix	an openbd.onix object that has DescriptiveDetail, CollateralDetail etc
	 * @param {Object} hanmoto	an openbd.hanmoto object that has maegakinado, kaisetsu105w etc
	 */
	bookinfo_from_isbn: function(onix, hanmoto){
		if(!onix && !hanmoto) return;
		if(onix.DescriptiveDetail && onix.DescriptiveDetail.Audience){
			var rating = 0;
			onix.DescriptiveDetail.Audience.forEach(function(ai){
				if(ai.AudienceCodeType === "22") rating = Number(ai.AudienceCodeValue);
			});
			if(rating > 0){console.log(onix.DescriptiveDetail.Audience); return;}
		}
		var han_descr,	//hanmoto description text
		otc = onix.CollateralDetail ? onix.CollateralDetail.TextContent : null;	//onix TextContent
		if(!otc && !(han_descr = hanmoto.maegakinado || hanmoto.kaisetsu105w)) return;	//no useful description
		var tcs = {},	//TextContent's
		pelt = document.querySelector("td[itemprop=isbn]").previousSibling,
		ancelt = Util.dom.element("a"),
		parts = this.fndr_util.prepare_parts(ancelt, (otc ? "ONIX TextContent" : "版元ドットコム") + " information");
		this.fndr_util.prepare_anchor(ancelt, pelt, "Book information from openBD ONIX", "📘");//📖
		if(otc){
			otc.forEach(function(tc){
				tcs[tc.TextType] = tc.Text.replace(/！/g, "。");	//register Text w/ TextType as a key
			});
			parts.fbox.appendChild(Util.dom.element("div", tcs["03"] || tcs["02"] || tcs["23"] || ""));
			if(tcs["04"]) parts.fbox.appendChild(Util.dom.element("div", "【目次】\n" + tcs["04"]));	//table of contents
		}else parts.fbox.appendChild(Util.dom.element("div", han_descr));
		parts.finder.classList.add("bookinfo");
		pelt.appendChild(parts.finder);
	},
	/**
	 * add IIIF viewer link and logo
	 * @param {DOMNode} span	HTML element to add link and logo
	 * @param {String} manifest	IIIF manifest url
	 * @param {String} canvas	url of specific Canvas in the IIIF manifest if any
	 */
	iiif_link: function(span, manifest, canvas){
		var iiif_link = Util.dom.element("a");
		iiif_link.href = Util.iiif.set_viewer_link(manifest, canvas, true);
		if(!Util.iiif.logo) Util.iiif.logo = Util.iiif.gen(16);
		iiif_link.title = "View this manifest with a IIIF viewer";
		iiif_link.appendChild(Util.iiif.logo.cloneNode(true));
		span.appendChild(Util.dom.text(" "));
		span.appendChild(iiif_link);
		span.classList.add("iiif");
	},
	/**
	 * add link icon to Wikipedia which corresponds to DBpedia resource
	 * @param {DOMNode} span	HTML element to add link
	 * @param {String} wpns	Wikipedia namespace (en|ja)
	 * @param {String} wpname	Wikipedia label
	 */
	wikipedia_link: function(span, wpns, wpname){
		var wp_link = Util.dom.element("a"),
		icon = Util.dom.element("img");
		wp_link.href = "https://" + wpns + "wikipedia.org/wiki/" + wpname;
		wp_link.title = "View Wikipedia page for " + wpname.replace("_", " ");
		if(this.app.img){
			icon.setAttribute("src", this.app.relpath + this.app.img.wikipedia);
			wp_link.appendChild(icon);
		}
		span.appendChild(Util.dom.text(" "));
		span.appendChild(wp_link);
	},
	/**
	 * set external link for non is_home_uri uris
	 * @param {DOMNode} elt	HTML element to append external link
	 */
	test_external_link: function(elt){
		if(this.is_home_uri) return;
		var span = Util.dom.element("span");
		this.sq_formatter.set_external_link(span, this.uris.tgrsrc);
		elt.appendChild(span);
	},
	
	
	
	
	///@@ query more information, mainly (but not limited to) called from set_object_tdval
	/**
	 * query and add type info for the uri (to be used for a value of props.typeinfo property)
	 * @param {DOMNode} span	HTML element to append type info
	 * @param {String} uri	taeget uri to query type info
	 */
	test_url_type: function(span, uri){
		var that = this, binds,
		//^ in uri causes an error. e.g. in arc_nishikie-UCB_2_1_10_016QM01_001
		query = "SELECT ?type WHERE {<" + uri.replace('^', '%5E') + "> a ?type .}",
		show_type = function(val){
			var tlabel = that.app.set_wrapper_content(val.replace(/^.*?([^\/#]+)+$/, "$1"));
			span.appendChild(tlabel);
			if(RegExp.$1 === "Manifest" && !span.classList.contains("iiif")) that.iiif_link(span, uri);
		};
		this.qh.handler(null, query, function(res){
			if((binds = that.qh.check_res(res, "type info", uri)) === false) return false;
			var bind = binds[0] || null;
			if(bind && bind.type.value){
				that.app.media_types[uri] = bind.type.value
				show_type(bind.type.value);
			}else{
				that.app.media_types[uri] = null;
			}
		});
	},
	/**
	 * try to find IIIF manifest from a canvas uri (asynchronous)
	 * @param {DOMNode} span	HTML element to append IIIF manifest link
	 * @param {Strintg} canvas	a canvas uri in question
	 */
	test_iiif: function(span, canvas){
		var that = this, binds,
		query = "SELECT ?type ?manifest WHERE {<" + canvas + "> a ?type ; " +
		"<" + this.ns.schema + "isPartOf> ?manifest .}";
		this.qh.handler(null, query, function(res){
			if(!(binds = that.qh.check_res(res, "manifest from " + canvas))) return false;
			if(!binds[0].manifest.value) return that.qh.log_error_msg("no manifest found", res);
			that.iiif_link(span, binds[0].manifest.value, canvas);
		});
	},
	/**
	 * test if a map already generated, then add a table of a map for post fetched
	 * @param {DOMNode} target_td	HTML element to append geo table
	 * @param {Array} uris	array of entity / location / geohash uris
	 * @param {String} locprops	property qname that relate target entity to its location, e.g. schema:location
	 * @param {Boolean} via_bnode	true if geo resource is a blank node (jps:spatial)
	 */
	geo_table: function(target_td, uris, locprops, via_bnode){
		var parent_table = target_td.closest("table");
		//to avoid redundant map in one spatial table
		if(parent_table.has_map) return false;
		target_td.appendChild(this.gen_geo_table(uris, locprops, via_bnode));
		//if(!uris) parent_table.has_map = true;
	},
	/**
	 * query lat/long/within of one location from a geo property and add a table w/ a map
	 * @param {Array} uris	array of entity / location / geohash uris
	 * @param {String} locprops	property qname that relate target entity to its location
	 * @param {Boolean} via_bnode	true if geo resource is a blank node
	 */
	gen_geo_table: function(uris, locprops, via_bnode){
		var geoprop = this.geo.prop.geo,
		query = "SELECT DISTINCT * WHERE {",
		uri;
		if(via_bnode){
			//uris, lcoporps are sets (two candidates) for bnode (jps:spatial)
			var uri = uris.shift(),
			locprop = locprops.shift(),
			bindp = "BIND(URI(\"" + this.geo.prop.cover + "\") as ?p)",
			latprop = this.geo.prop.lat,
			longprop = this.geo.prop.long,
			qgroup = one_qgroup(uri, locprop, bindp);	//first priority query
			query += (uris.length === 0 ? qgroup :
			"{" + one_qgroup(uris[0], locprops[0], bindp) + "} UNION {" + qgroup + "} ");	//if 2uris, 2nd priority query
		}else{
			uri = uris;
			//else the uri is of a geohash (=geocoord) ie query is <uri> [?p ?o]
			query += "BIND(<" + uri + "> as ?s) ?s ?p ?o";
		}
		query += "}";
		//console.log(query);
		return this.later_table(uri, query, "geo props", via_bnode);
		//build group pattern
		function one_qgroup(myuri, locprop, bindp){
			var qg = "BIND(<" + myuri + "> as ?s)\n";
			//if the uri is of an entity, then query is <uri> schema:location/schema:geo [?p ?o]
			if(locprop) qg += "?s <" + locprop + "> ?loc .\n" +
			"{" + bindp + " ?loc ?p ?o .\n?o <" + latprop + "> ?olat ; <" + longprop + "> ?olong}\n" +
			"UNION {?loc <" + geoprop + "> ?gh . ?gh ?p ?o }";
			//if the uri is of a location, then query is <uri> schema:geo [?p ?o]
			else qg += "{" + bindp + " ?s ?p ?o}\nUNION {?s <" + geoprop + "> ?gh . ?gh ?p ?o }";
			return qg;
		}
		
	},
	/**
	 * add description table to indirect statements
	 * e.g. advertisement about a book 2020-09-03 or sub-contents (#frag of main item)
	 * Snorqldef.ldb.dist_propsプロパティ値もしくは主アイテムのフラグメントであるURIの入れ子記述テーブルを追加する。
	 * @param {String} uri	value URI of the dist_props property or #frag of main item
	 * @param {DOMNode} tbody	ancestor tbody element
	 * @return {DOMNode}	description table element
	 */
	desciption_sub_table: function(uri, tbody){
		if(this.app.uris.proced.indexOf(uri) !== -1) return;
		var query = "DESCRIBE <" + uri + ">";
		return this.later_table(uri, query, tbody);
	},
	/**
	 * get p/o of a URI (e.g. geo which is not bnode and cannot get p/o as CBD) and generate nested table asynchronously
	 * 主アイテムのdescribeでは取得できないリソースについて、非同期でdescribeクエリを送り、サブテーブルとして追加する
	 * @param {String} uri	URI of (the parent node of) the subject to fetch further p/o
	 * @param {String} query	query string to get p/o to fill the table
	 * @param {String|DOMNode} pinfo	target property (parent of uri, or prop of uri if via_bnode) 
			or ancestor tbody (in case of desciption_sub_table)
	 * @param {Boolean} via_bnode	set if to obtain target p/o as prop [?p ?o] . Use when fetch geocoord of an entity
	 * @return {DOMNode}	table element of the p/o
	 */
	later_table: function(uri, query, pinfo, via_bnode){
		var that = this, binds,
		prop = typeof(pinfo) === "string" ? pinfo : "",
		job_label = prop || "extra po",
		table = Util.dom.element("table"),
		test_rdfjson = !this.app.is_virtuoso;	//accept RDF/JSON results for non virtuoso endpoint 2021-02-09
		//query asynchronous
		this.qh.handler(null, query, function(newres){
			if(!(binds = that.qh.check_res(newres, job_label, uri, false, test_rdfjson))) return false;	//"no po found for " + uri
			//prepare solution object for the uri in rdfjson
			var loc, gh, latlon = {}, rdfj, is_describe;
			if(query.match(/^describe/i)){
				//e.g. called from desciption_sub_table
				var ptd = table.parentNode;
				if(binds.length === 1 && binds[0].p.value === that.ns.rdfs + "label"){
					//if only rdfs:label presents, make it a subtext span instead of a table
					ptd.replaceChild(that.app.set_wrapper_content(binds[0].o.value), table);
					return;
				}else{
					//add sub-table toggler since sub-table might be too big to glasp entire structure of the item itself
					//it is added to value description = there is a value node even when sub-table is hidden 2021-02-14
					ptd.insertBefore(gen_toggler(table), table);
				}
				is_describe = true;
				that.app.saved.rdfjson.push(that.app.rdfjson);
				if(binds[0] === "rdfjson") that.app.rdfjson = binds[1];
				else if(binds[0] === "bindings") that.app.rdfjson = that.app.binds2rdf(binds[1]);
				else that.app.rdfjson = that.app.binds2rdf(binds);
			}else{
				//e.g. called from gen_geo_table
				//note toggler is not attached to the geo table
				is_describe = false;
				var rdfj_s = binds[0] === "rdfjson" ? binds[1] : proc_binds(binds, loc, gh, latlon);
				//then select result the sets of appropriate place (subject)
				var lkey = Object.keys(rdfj_s),
				rdfj = rdfj_s[uri] || rdfj_s[lkey[0]],
				upos = that.uris.proced.indexOf(uri);
				//in case lat/log is taken from proced uri resource (e.g. target uri)
				if(upos !== -1) that.uris.proced.splice(upos, 1);
				//then set caption for bnode
				if(via_bnode) set_bnode_caption(rdfj, uri, lkey, latlon, loc, gh);
				//uri was not set before query for bnode
				that.app.rdfjson[uri] = rdfj;
			}
			//then generate a nested table
			that.app.format_one_uri(uri, null, "", table);
			that.app.uris.proced.push(uri);	//add proced uris here to avoid dup process
			//if(!is_describe) Util.map.refresh();
			if(prop === "geo props") Util.map.refresh();
			else if(that.app.exlabel.fetch === "+prop") that.prop_labels();	//while labels() fetch nested elts with optional, prop_labels() relay on proptds which generated on actual spo
		});
		//return table (and display) not waiting query result
		return table;
		
		//// local functions
		// prepare solution object for the uri in rdfjson
		function proc_binds(bindings, loc, gh, latlon){
			if(test_rdfjson && bindings[0] === "bindings") bindings = bindings[1];
			var rdfj_s = {}, done_prop = {};
			//add result p/o to RDFJson object
			bindings.forEach(function(bind){
				var s = bind.s.value,
				p = bind.p.value;
				//assuming that higher priority query result was returned first in the solution sets
				//not necessarily. So, first store a set by its subject (s)
				if(!rdfj_s[s]){
					rdfj_s[s] = {};
					done_prop[s] = [];
				}else if(done_prop[s].indexOf(p) !== -1) return;
				done_prop[s].push(p);
				if(bind.loc && !loc) loc = bind.loc;
				if(bind.gh && !gh) gh = bind.gh.value;
				if(!rdfj_s[s][p]) rdfj_s[s][p] = [];
				rdfj_s[s][p].push(bind.o);
				//console.log(p, bind.s.value, latlon);
				if(bind.olat && !rdfj_s[s][that.geo.prop.lat]){
					//lat/long of geoGoveredBy
					rdfj_s[s][that.geo.pseudop.lat] = [bind.olat];
					rdfj_s[s][that.geo.pseudop.long] = [bind.olong];
				}
			});
			return rdfj_s;
		}
		// set caption for bnode
		function set_bnode_caption(rdfj, uri, lkey, latlon, loc, gh){
			var caption;
			if(!latlon[uri]) uri = lkey[0];
			//where schema:loc has place:XXX value, not a bnode (though actual subj shuould be its geo)
			if(loc && loc.type === "uri"){
				uri = gh; //loc.value;
				caption = "→ schema:geo → <" + gh + ">";
				if(rdfj[that.ns.schema + "geoCoveredBy"]) delete rdfj[that.ns.schema + "geoCoveredBy"];
			}else{
				//makes clear that those values are not direct properties of this node
				caption = "fetched via " + prop + " of " + that.sq_formatter._toQName(uri);
				if(loc) uri = loc.value.replace(/^nodeID:\/\/(.+)/, "_:$1");
			}
			table.classList.add("viabnode");
			that.app.set_table_caption(table, caption);
			if(rdfj[that.ns.schema + "latitude"] && rdfj[that.geo.pseudop.lat]){
				delete rdfj[that.geo.pseudop.lat];
				delete rdfj[that.geo.pseudop.long];
			}
		}
		//toggles sub-table
		function gen_toggler(target_node){
			var is_closed = (pinfo.childNodes.length > 1),	//sub-table initially closed if parent tbody has multi rows, ie property has multi values (e.g. schema:about)
			swchar = is_closed ? "⊞" : "⊟",
			span = Util.dom.element("span", swchar, [["class", "switcher"]]);
			span.addEventListener("click", function(){
				if(span.innerText === "⊟"){
					target_node.style.display = "none";
					span.innerText = "⊞";
				}else{
					target_node.style.display = "table";
					span.innerText = "⊟";
				}
			}, false);
			if(is_closed) table.style.display = "none";
			return span;
		}
	},
	/**
	 * add labels for object resourece. modified to be called after main RDF processed 2020-08-25
	 * プロパティ値について非同期でラベルを取得し、値の脇に付加する
	 * @param {String} uri	subject URI of the main described resource
	 */
	labels: function(uri){
		//setup another query to get labels for each RDF object
		var query = "SELECT DISTINCT ?s ?o ?en WHERE { {<" + uri +"> ?q ?s .} " +
		this.app.exlabel.union(uri, this) +	//UNIONパターンをsnorqldefで上書き定義できる
		//get_more_cond(this) +
		this.app.exlabel.more_cond(uri, this) +
		"?s <" + this.ns.rdfs + "label> ?o ." +	//use rdfs:label for Japanese
		this.app.exlabel.lang_filter
		+ "}";
		//generalize fetch and add
		this.get_set_labels(query, this.app.ovtds, true);
		
		//additional labels for item with a category
		function get_more_cond(that){
			if(!that.app.category) return "";
			var props = [
				"http://purl.org/dc/terms/source",
				that.ns.schema + "subjectOf",	//e.g. as subject of ref book in Basho
				that.ns.schema + "translator"
			];
			return "UNION {<" + uri +"> ?p [(<" + props.join(">|<") + ">) ?s]} ";
		}
	},
	/**
	 * get labels for properties if so instructed
	 * プロパティ「名」について非同期でラベルを取得し、プロパティ名の脇に付加する
	 */
	prop_labels: function(){
		//use this.app.proptds instead of passing as arg, since arg value cannot clear original proptds at the last proc
		var props = Object.keys(this.app.proptds).join('" "'),
		query = "SELECT DISTINCT ?s ?o ?en WHERE { " +
		"VALUES ?prop {\"" + props + "\"} BIND(IRI(?prop) as ?s) " +
		"?s <" + this.ns.rdfs + "label> ?o ." +
		this.app.exlabel.lang_filter

		+ "}";
		this.get_set_labels(query, this.app.proptds, false);
		this.app.proptds = {};	//clear td list for nested call (via later_table)
	},
	/**
	 * generalized fetch and add labels (query labels and add them to specified td elements)
	 * @param {String} query	SPARQL query to fetch labels
	 * @param {Object} tds	object that holds target tds to attach labels
	 * @param {Boolean} is_obj_label	true if it is for property values, else for property names
	 */
	get_set_labels: function(query, tds, is_obj_label){
		var that = this,
		binds,
		service = this.qh.set_service(),
		set_labels = function(newres){
			if(!(binds = that.qh.check_res(newres, "label"))) return false;
			var done = [], bind_notyet = {}, target_td;
			binds.forEach(function(bind){
				//some values have more than one labels (e.g.keyword:住居 rdfs:label "House", "Houses")
				if(done.includes(bind.s.value)) return;
				done.push(bind.s.value);
				if((target_td = tds[bind.s.value])) that.set_label_tds(bind, target_td);
				else bind_notyet[bind.s.value] = bind;	//nested td not yet generated
			});
			if(is_obj_label && Object.keys(bind_notyet).length){
				//wait for generating nested table for additional resources
				setTimeout(function(){that.check_not_yet_labels(bind_notyet)}, 1000);
			}
		},
		failed =function(newres){
			return that.qh.log_error_msg("label fetche failed", newres);
		};
		service.query(query, {success: set_labels, failure: failed});
	},
	//set label element to tds (which already generated)
	set_label_tds: function(bind, target_td){
		var val = (Util.ualang !== "ja" && bind.en) ? bind.en.value : bind.o.value;
		//now append label to the saved target_td here, instead of adding to main jsonres.bindings
		target_td.forEach(function(td){
			var tlc = td.lastChild;
			if(tlc && (tlc.tagName.toLowerCase() === "table")) return;	//no label if extra table exists2020-11-16
			td.appendChild(this.app.set_wrapper_content(val));
		}, this);
	},
	//check if tds (which were not ready on get_set_labels) generated and try set again
	check_not_yet_labels: function(bind_notyet){
		var target_td;
		for(var uri in bind_notyet){
			if((target_td = this.app.ovtds[uri])) this.set_label_tds(bind_notyet[uri], target_td);
			//else console.log("td for label of", uri, "not ready");
		}
	},
	
	/// from more_on_property
	/**
	 * add a license badge, also test license uri is an individual (non conditional) policy, and add "ipd" class if true
	 * ライセンスURIバッヂを加え、さらに「単一ポリシー定義」であるかどうかを確認し、該当したら"ipd"クラスを設定する。
	 * @param {DOMNode} ovtd	<td> element that contains license uri node, to add a badge and "ipd" class
	 * @param {String} licenseuri	the license uri in question
	 */
	if_indiv_policy: function(ovtd, licenseuri){
		var that = this, binds,
		query = "PREFIX pds: <http://purl.org/net/ns/policy#>\n" +
		"PREFIX dct: <http://purl.org/dc/terms/>"+
		"select distinct ?ref ?ipd where {<" + licenseuri + "> dct:isVersionOf? ?ref .\n" +	//added distinct to avoid dup badges2021-01-22
		"?ref a pds:ReferencePolicy .\n" +
		"OPTIONAL{<" + licenseuri + "> a ?ipd . ?ipd rdfs:subClassOf pds:IndividualPolicyDefinition}}";
		this.qh.handler(null, query, function(res){
			if(!(binds = that.qh.check_res(res, "ipd results", licenseuri + " (license uri)"))) return false;
			binds.forEach(function(bind){
				if(bind.ipd) ovtd.classList.add("ipd");	//individual policy definition
				if(bind.ref) test_icon(bind.ref.value, ovtd);
			});
			return true;
		});
		function test_icon(reflicense, ovtd){
			var src = that.license_badge(reflicense, "s");
			if(src){
				var imgelt = Util.dom.element("img");
				imgelt.src = src;
				ovtd.appendChild(imgelt);
			}
		}
	},
	/**
	 * add a license badge icon for createve commons or rightsstatements.org after license uri
	 * @param {String} uri	a license uri
	 * @param {String} size	badge size (s|l)
	 */
	license_badge: function(uri, size){
		var m;
		if((m = uri.match(/^http:\/\/creativecommons.org\/(licenses|publicdomain)\/([^\/]+)/))){
			return "https://licensebuttons.net/" +
			((m[1]==="licenses") ? "l/" + m[2] + "/4" : "p/" + m[2] + "/1") + 
			".0/" + (size === "l" ? "88x31" : "80x15") + ".png";
		}else if(m = uri.match(/^http:\/\/rightsstatements.org\/vocab\/([^\/]+)/)){
			return "https://rightsstatements.org/files/buttons/" + m[1] + ".dark-white-interior.svg";
		}
		return null;
	},
	
	
	////@@ search inbound link
	/**
	 * add object-subject-property table where subject is current target uri
	 * i.e. with current uri as object(o), get resources(s) that have relation(p) 2019-02-11
	 * Describe対象のURIを目的語とするデータを探す。作者、場所などの情報表示時に使える。
	 * @param {DOMNode} div	element to add search result table
	 * @param {DOMNode} msgarea	element to show progression message
	 * @param {Boolean} as_agential	true if current uri has type Agent
	 */
	osp: function(div, msgarea, as_agential){
		var that = this,
		query = prepare_query(this.uris.tgrsrc, as_agential);
		msgarea.osp_done = true;
		if(!query) return false;	//no further query if tguri is a variable. 2021-05-08
		msgarea.innerText = "asking ... ";
		msgarea.className = "busy";
		this.qh.handler(null, query, function(json){
			if(!that.qh.check_res(json, "related data", "", msgarea)) return false;
			new SPARQLSelectTableFormatter(json, that.ns, that.snorql).toDOM(div, true);
			if(as_agential){
				var qname = that.uris.tgrsrc.replace(/^https:\/\/jpsearch.go.jp\/entity\/(.+?)\/(.+)/, "$1:$2");
				msgarea.innerText = "Resources that " + qname +" is a contributor or a topic of:"
			}else{
				var urid = Util.str.trim(that.uris.tgrsrc, 80, [50, 20]);
				msgarea.innerText = "Resources that relate to <" + urid +">:";
			}
			msgarea.className = "";
			Util.example.update_qtarea(query);
			return true;
		});
		//msgarea.osp_done = true;
		
		function prepare_query(tguri, as_agential){
			if(!tguri) return "";	//tguri is empty if query is a type of DESCIBE ?var WHERE
			return (as_agential) ?
			"SELECT ?s ?label ?image WHERE {\n" +
			"\t?s rdfs:label ?label ;\n" +
				"\t\tjps:agential/jps:value/owl:sameAs? <" + tguri + ">\n" +
			"\tOPTIONAL {?s schema:image ?image}\n} LIMIT 500"
			:
			"SELECT DISTINCT ?s ?label ?p ?p2 WHERE {\n" +
			"\t{?s ?p <" + tguri + ">  FILTER(isIRI(?s))} UNION\n" +
			"\t{?s ?p ?o . ?o ?p2 <" + tguri + "> FILTER(isBLANK(?o))\n" +
				"\t\tMINUS {?s ?p3 <" + tguri + ">}\n\t}\n" +
			"\tOPTIONAL {?s rdfs:label ?label}\n} LIMIT 500";
		}
	},
	/**
	 * prepare a pseudolink button to trigger osp search
	 * @param {DOMNode} div	element node that has the description table
	 */
	set_osp_btn: function(div){
		var that = this,
		cdiv = Util.dom.element("div"),	//additional info division
		btn = Util.dom.element("span"),
		qrel = location.search.match(/qrel=([^&]+)/);	//provide qrel url=contributor param to display contributing items
		
		if(this.app.exserv) cdiv.appendChild(this.graphdraw_form());	//2020-03-24, changed position 2021-03-01
		cdiv.appendChild(btn);
		btn.osp_done = false;	//to be set true in osp()
		if(qrel){
			//excecute immediately if qrel instruction presents. 2021-01-19
			this.osp(cdiv, btn, (qrel[1] === "contributor"));
		}else{
			btn.innerText = "get resources that relate to this URI";
			btn.addEventListener("click", function(ev){
				if(!btn.osp_done) that.osp(cdiv, btn);	//fetch only once.
			}, false);
			btn.className = "pseudolink";
		}
		div.appendChild(cdiv);
	},
	
	
	///@@ hint for URI that not found description in the endpoint. Specific to Japan Search
	/**
	 * find if there is a corresponding chname for ncname, then show link table if found
	 * @param {DOMNode} div	ancestor div element
	 * @param {Object} subdiv	parent div element of a description table if results found
	 * @param {String} uri	URI of current target resource
	 */
	ncname_hint: function(div, subdiv, uri){
		if(!this.ns.ncname || !uri.match(new RegExp("^" + this.ns.ncname))) return; //only for ncname
		var that = this,
		tbl = subdiv ? subdiv.firstChild : null,
		chname = uri.replace("/ncname/", "/chname/"),
		query = "ASK {<" + chname + "> rdfs:label ?label}";
		if(!tbl){
			tbl = Util.dom.element("table");
			div.appendChild(tbl);
		}
		//try ASK query for chname
		this.qh.handler(null, query, function(json){
			if(!json.boolean) return ask_wp(uri);	//if not found, try wikipedia
			set_link(chname, "chname");	//if found, show suggestive link
			return true;
		});
		//ask Wikipedia for ncname
		function ask_wp(uri){
			var m = uri.match(/ncname\/(.+)$/),
			tgname = m[1],	//m[1] is localname of ncname
			wphost = "https://ja.wikipedia.org/",
			dbphost = "http://ja.dbpedia.org/",
			wpquery = wphost + "w/api.php?action=query&format=json&prop=categories&redirects&titles=" + tgname;
			Util.xhr.get(Util.uri.https_proxy() + wpquery, function(res){	//
				var rq = res.query || null,
				pages = rq ? rq.pages : null;
				if(!pages) return false;
				for(var key in pages){
					if(key == -1) return false;
					var wpname = pages[key].title,
					tbody = set_link(wphost + "wiki/" + wpname, "possible Wikipedia name");
					//if wpname is different from localname of ncname, try to find sameAs dbpedia
					if(tgname !== wpname) try_sameas_chname(dbphost + "resource/" + wpname, tbody);
					return true;
				}
			});
		}
		//if found chname or wikipedia name, show a link
		function set_link(tguri, which){
			if(!subdiv) tbl = Util.dom.prepare_desc_table(tbl);
			//if corresponding chname found, add a table row to link the chaname
			var tb = Util.dom.element("tbody"),
			tr = set_one_row(tguri, which);
			if(subdiv) tb.className = "more-chname";
			tb.appendChild(tr);
			tbl.appendChild(tb);
			return tb;
		}
		//set one result table row with a link
		function set_one_row(tguri, which){
			var tr = Util.dom.element("tr"),
			td1 = Util.dom.element("td", "(" + which + " found)"),
			td2 = Util.dom.element("td"),
			anc = Util.dom.element("a", tguri);
			anc.href = tguri;
			anc.className = "uri";
			anc.innerHTML = anc.innerHTML.replace("/chname/", "/<b>chname</b>/");
			td2.appendChild(anc);
			tr.appendChild(td1);
			tr.appendChild(td2);
			return tr;
		}
		//try to find chname which is sameAs dbpedia (when local name is different)
		function try_sameas_chname(dbp, tbody){
			var binds,
			sa_query = "SELECT ?s WHERE {?s owl:sameAs <" + dbp +">; rdfs:isDefinedBy <https://jpsearch.go.jp/entity/chname/>}";
			that.qh.handler(null, sa_query, function(res){
				if(!(binds = that.qh.check_res(res, "sameAs chname"))) return false;
				if(!binds[0].s) return false;
				var sa_tr = set_one_row(binds[0].s.value, "chname sameAs dbpedia");
				tbody.appendChild(sa_tr);
				return true;
			});
		}
	},
	
	
	///@@ more additional info via query (experimental). multilang labels are built-in and default lang is fixed to Japanese. 関連検索のテスト
	/**
	 * add similar title search icon 2020-03-28
	 * @param {String} itemtype	rdf:type of the item to limit search scope
	 */
	title_more_search: function(itemtype){
		if(!this.app.title) return;
		var tip = [["型が", "で、タイトルが", "を含む", "同じである", "アイテムを探す"],
			["find items of type ", " with ", "similar", "the same", " title"]][this.langidx],
		ancelt = Util.dom.element("a", "🔍"),	//📚
		ocpat = {"o": "\\[〔《［「＜（", "c": " ：　\\/\\]〕》］」＞）"},	//delimiting open/close pattern
		bifpat = new RegExp("^[" + ocpat.o + "]?([^a-z\\.\\-"+ ocpat.o + ocpat.c + "]+)[" + ocpat.c + "]"),
		titleelt = document.querySelector("tbody.label td"),	//:nth-child(2) for value cell
		//constructs of query
		query = "SELECT DISTINCT ?s ?title (sample(?who) as ?who) (sample(?publisher) as ?publisher) ?when",
		tcond = "?s rdfs:label ?title",	//title condition
		acond = "a",	//type condition (may be appended by /subClassOf*)
		bindcond = "BIND(\"" + this.app.title + "\" as ?title) ",	//exact match, bind to get title as a result var
		optcond = "\n\tOPTIONAL {?s (schema:creator|schema:contributor)/rdfs:label ?who}\n\tOPTIONAL {?s schema:publisher/rdfs:label ?publisher}\n\tOPTIONAL {?s schema:datePublished ?when}",
		imgcond = false,	//whether to obtain schema:image
		titlekwd = this.app.title,	//title or keyword (sub part) for bif:contains
		maxbiflen = 12,
		filtercond = tcond +" FILTER ",
		filtcloser = "\")";
		if(this.app.is_virtuoso){
			//bif full text match if virtuoso
			filtercond += "bif:contains(?title,\"'";
			filtcloser = "'" + filtcloser;
		}else{
			//regex search otherwise. can be "contains"
			filtercond += "regex(?title, \"";
		}
		//query modifiers based on item type (Japan Search classes)
		if(itemtype.match(/^(絵画|版画|素描|水彩)/)){
			acond += "/rdfs:subClassOf?";
			itemtype = "絵画";
			imgcond = true;
		}else if(itemtype.match(/^(写真|絵画等)/)){
			imgcond = true;
		}
		if(this.app.title.match(bifpat)){
			//title/label has sub parts
			if(RegExp.$1.length > maxbiflen * 2) filtercond = "";	//wont use long sub part for bif:contains
			else{
				filtercond += RegExp.$1 + filtcloser;
				titlekwd = RegExp.$1;
			}
		}else if(this.app.title.length <= maxbiflen){
			//if title has no sub parts but short enough for full text search
			filtercond += this.app.title + filtcloser;
		}else filtercond = "";
		if(imgcond){
			query += " ?image";
			optcond += "\n\tOPTIONAL {?s schema:image ?image}";
		}
		//build a query
		query += " WHERE{\n\t?s "+ acond + " type:" + itemtype +" .\n\t" + (filtercond || bindcond + tcond) +
		optcond + "\n} ORDER BY ?title ?when LIMIT 500";
		ancelt.setAttribute("href", "?query=" + encodeURIComponent(query));
		ancelt.setAttribute("title", tip[0] + '"' + itemtype + '"' + tip[1] + 
			(filtercond ? (this.langidx ? "" : '"' + titlekwd + '"') + tip[2] : tip[3]) + tip[4]);
		ancelt.classList.add("finder");
		titleelt.appendChild(ancelt);
		this.nxdl_img_search(titleelt, titlekwd);
	},
	/**
	 * add similar image icon = test to use NDL labo image search from label. 2020-03-29
	 * NDL次世代デジタルライブラリー類似画像検索の「資料のタイトルや目次から」機能を用いる
	 * @param {DOMNode} pelt	parent element to add icon (rdfs:label <td> in this case)
	 * @param {String} titlekwd	keyword to search Next Digital Library
	 */
	nxdl_img_search: function(pelt, titlekwd){
		//only works for NDL Digital collection items for now
		if(!pelt || !this.uris.tgrsrc.match(/dignl-(\d+)$/)) return;
		var that = this,
		bid = RegExp.$1,
		dlurl = "https://lab.ndl.go.jp/dl/",
		iseach = dlurl + "illust/search?",
		nxdl = ["次世代デジタルライブラリー", "Next Digital Library"],
		tip = [[nxdl[0] + "画像検索", "のパネル表示切り替え", "：キーワードから"],
			[nxdl[1] + " Illustration Search", ": toggle panel", " by keyword"]][this.langidx],
		tipttl = ["この画像を用いて次世代DL類似画像検索","use this image for illustration search"][this.langidx],
		kwdlink = iseach + "keyword=" + encodeURIComponent(titlekwd),
		ancelt = Util.dom.element("a");
		Util.xhr.get(dlurl + "api/illustration/of/" + bid, function(res){
			//query illusts in the item
			ancelt.classList.add("finder");
			pelt.appendChild(ancelt);
			if(res.list.length){
				//if any illustration is registered, set image search panel
				that.fndr_util.prepare_anchor(ancelt, pelt, tip[0] + tip[1]);
				pelt.appendChild(setup_selection_table(res.list));
			}else{
				ancelt.innerText = "🔖";
				ancelt.setAttribute("href", kwdlink);
				ancelt.setAttribute("title", tip[0] + tip[2]);
			}
		});
		//prepare image search panel
		function setup_selection_table(ilist){
			var item,
			parts = that.fndr_util.prepare_parts(ancelt, 
				["キーワード／この資料内の図表から<strong>"+nxdl[0]+"で類似画像を</strong>検索",
				"Find <strong>similar images</strong> from keyword / figures in this item w/ "+nxdl[1]][that.langidx]),
			kwdbx = Util.dom.element("span", ["🔖キーワード", "keyword"][that.langidx] + ": "),
			kwdanc = Util.dom.element("a", titlekwd, [["href", kwdlink]]);
			kwdanc.setAttribute("title", tip[0] + tip[2]);
			kwdbx.appendChild(kwdanc);
			parts.fbox.appendChild(kwdbx);
			for(var i=0; i<5; i++){
				if(!(item = ilist[i])) break;
				that.fndr_util.set_ibox(parts, iseach + "image=" + item.id, 
					"https://www.dl.ndl.go.jp/api/iiif/" + bid + "/R" + ("0000000" + item.page).slice(-7) +
					"/pct:" + [item.x, item.y, item.w, item.h].join(",") + "/,128/0/default.jpg",
					tipttl
				);
			}
			return parts.finder;
		}
	},
	/**
	 * test to use JPS / CJ image search 2020-03-31, entended 2020-06-14
	 * ジャパンサーチ/Cultural Japanの類似画像検索を利用する。「資料のタイトルや目次から」とは異なり、画像自身の類似を調べる。
	 * @param {DOMNode} pelt	parent element to add icon (schema:image <td> in this case)
	 */
	img_search: function(pelt){
		var home = this.snorql.homedef.uri,
		limit = 8,
		f, api_q, tipn;
		if(!pelt || !home) return;
		if(home === "https://jpsearch.go.jp/"){
			if(!this.uris.tgrsrc.match(/^(.+jpsearch\.go.+data\/)([^\/]+)$/)) return;
			api_q = home + "api/item/search/jps-cross?csid=jps-cross&from=0&size=" + limit + "&image=" + RegExp.$2;
			tipn = ["ジャパンサーチ", "Japan Search"];
			f = {
				selector: function(res){return res.list;},
				uri: function(item){return "?describe=" + that.snorql.homedef.datauri + item.id;},
				thumb: function(item){return item.common.thumbnailUrl;},
				title: function(item){return item.common.title;}
			};
		}else if(home === "https://cultural.jp/"){
			//2020-06-14
			if(!this.uris.tgrsrc.match(/^(.+cultural\.jp.+data\/|.+jpsearch\.go.+data\/)([^\/]+)$/)) return;
			api_q = "https://api.cultural.jp/search?image=" + RegExp.$2; // + limit + ,
			tipn = ["Cultural Japan", "Cultural Japan"];
			f = {
				selector: function(res){return res.hits ? res.hits.hits : null;},
				uri: function(item){return (item._id.match(/^(cobas|dignl|arc_|issnl|bunka|najda)/) ? "https://jpsearch.go.jp" : "https://ld.cultural.jp") + "/data/" + item._id;},
				thumb: function(item){return item._source._image;},
				title: function(item){return item._source._title;}
			};
		}else return;	//only works for JPS/CJ items
		
		var that=this,
		tip = [tipn[0] + "画像検索のパネル表示切り替え", tipn[1] + "Illustration Search: toggle panel"][this.langidx],
		stip = [tipn[0] + "内<strong>アイテム</strong>の類似サムネイル画像を検索中（時間がかかる場合あり）… ",
				"Searching items with similar image in " + tipn[1] + " (may take time) ..."][this.langidx],
		readyttl = [tipn[0] + "<strong>アイテム</strong>の類似サムネイル画像検索結果（最大" + limit + "件）",
				tipn[1] + " <strong>items</strong> with similar image (max " + limit + ")"][this.langidx],
		searching = stip + this.app.img_elt_tag("spinner-light"),
		ancelt = Util.dom.element("a"),
		parts = this.fndr_util.prepare_parts(ancelt, searching);
		//set anchor befor api request which would take time
		this.fndr_util.prepare_anchor(ancelt, pelt, tip);
		pelt.appendChild(parts.finder);
		//search api request
		Util.xhr.get(api_q, function(res){	//api + itemid
			var itemlist = f.selector(res);
			if(!itemlist){
				parts.capt.innerText = "Similar item request failed";
				console.log(api_q, res);
			}else if(!itemlist.length){
				//if similar item not found, show a regret message
				parts.capt.innerText = "Similar item not found";
			}else{
				//if found, prepare image panel
				var item;
				for(var i=0; i<limit; i++){
					if(!(item = itemlist[i])) break;
					that.fndr_util.set_ibox(parts, f.uri(item), f.thumb(item), f.title(item));
				}
				parts.capt.innerHTML = readyttl;
			}
		});
	},
	//utilities for image/nextdl search or other finder parts
	fndr_util: {
		/**
		 * prepare anchor on the parent td element
		 * @param {DOMNode} ancelt	anchor element (usually <a>)
		 * @param {DOMNode} pelt	parent element to add the anchor
		 * @param {String} tip	tool tip text
		 * @param {String} emoji	Emoji Unicode character used as pseudo icon
		 */
		prepare_anchor: function(ancelt, pelt, tip, emoji){
			ancelt.classList.add("finder");
			pelt.appendChild(ancelt);
			ancelt.innerText = emoji || "🎨";
			ancelt.setAttribute("title", tip);
			pelt.style.position = "relative";
		},
		/**
		 * prepare popup finder sub-window parts
		 * @param {DOMNode} ancelt	anchor element (usually <a>)
		 * @param {String} caption	caption of the popup
		 * @return {Object}	{"finder": finderwindow, "fbox": flexbox, "capt": caption}
		 */
		prepare_parts: function(ancelt, caption){
			var finder = Util.dom.element("div", "", [["class", "finder"]]),
			capt = Util.dom.element("p"),
			fbox = Util.dom.element("div", "", [["class", "fbox"]]), 
			closer = Util.dom.element("span", "×", [["class", "closer"]]);
			capt.innerHTML = caption;
			finder.appendChild(capt);
			finder.appendChild(fbox);
			finder.appendChild(closer);
			ancelt.addEventListener("click", function(ev){
				if(finder.classList.contains("show")) finder.classList.remove("show");
				else finder.classList.add("show");
				ev.preventDefault();
			});
			document.body.addEventListener("click", function(ev){
				if(ev.target === ancelt || (ev.path || ev.composedPath()).includes(finder)) return;
				else if(finder.classList.contains("show")) finder.classList.remove("show");
			});
			closer.addEventListener("click", function(){
				finder.classList.remove("show");
			});
			return {"finder": finder, "fbox": fbox, "capt": capt};
		},
		/**
		 * set one image box on the popup sub-window
		 * @param {Object} parts	finder parts object set by prepare_parts
		 * @param {String} link	item uri of the image
		 * @param {String} imgsrc	image url
		 * @param {String} title	title of the item
		 */
		set_ibox: function(parts, link, imgsrc, title){
			var ibox = Util.dom.element("span"),
			img = Util.dom.element("img"),
			imganc = Util.dom.element("a", "", [["href", link]]);
			img.src = imgsrc;
				Util.img.on_event(img, {w:50});
			imganc.appendChild(img);
			if(title) imganc.title = title;
			ibox.appendChild(imganc);
			parts.fbox.appendChild(ibox);
		}
	},
	
	
	
	//have fun!
	graphdraw_form: function(){
		var that = this,
		f = Util.dom.element("form", null, [["action", this.app.exserv + "graph-draw"], ["method", "POST"]]),
		trigger = Util.dom.element("span", "🕸", [["class","strigger"], ["title", "draw graph"]]),
		gddfld = Util.dom.element("input", null, [["type","hidden"], ["name", "jsonobj"], ["value", ""]]);
		f.appendChild(trigger);
		f.appendChild(gddfld);
		trigger.onclick = function(){
			var jobj = Object.assign({}, that.app.rdfjson);
			if(that.app.saved.rdfjson.length) that.app.saved.rdfjson.forEach(function(sj){
				for(var key in sj) jobj[key] = sj[key];
			});
			f.jsonobj.value = JSON.stringify(jobj);
			f.submit();
		};
		return f;
	}
};

//@@ ///External Resource finder.  Moved to independent class 2020-06-27
/**
 * more info for LOD values. 外部LODにクエリを送り、別テーブルに結果を表示する。
 * @param {object} jrdf	parent object
 * @param {object} snqdef_map	additional mapping defined in Snorqldef.askex
 */
var AskExternal = function(jrdf, snqdef_map){
	this.app = jrdf;	//calling JsonRDFFormatter instance
	this.qh = jrdf.qh;	//GnrQueryHandler instance prepared by parent
	this.tgsdiv = null;	//target sub div element to append proc results. set in proc()
	this.snorql = jrdf.snorql;	//shortcut for snorql instance
	this.tguri = jrdf.uris.tgrsrc;	//shortcut for current target uri
	this.wdp = {"base":"http://www.wikidata.org/prop/"};
	this.wdp.dt = this.wdp.base + "direct";
	//rights statement types
	this.rstypes = ["License", "IndividualPolicyStatement", "ReferencePolicy", "RightsStatement", "AboutPage"];
	//mapping of target uri pattern -> processing function. more mapping can be added via Snorqldef
	//処理URIパターン→AskExProc関数マッピング。Snorqldefによる追加定義可能
	this.pat2proc = {
		"http://id.ndl.go.jp/auth/": AskExProc.ask_ndla,
		"http://www.wikidata.org/entity/": AskExProc.ask_wikidata,
		"http://(ja.)?dbpedia.org/resource/":  AskExProc.ask_dbpedia,
		"http://viaf.org/viaf/": AskExProc.ask_viaf,
		"http://id.loc.gov/authorities/names/": AskExProc.ask_lcnames,
		"http://data.e-stat.go.jp/lod/sac/": AskExProc.ask_sac
	};
	//extra nspfx to uri mapping. driver will pass array of pfx's to add to snorql.more_ns for result table qname. 
	this.exns = {
		"dbp-owl": "http://dbpedia.org/ontology/",
		"dbp-propj": "http://ja.dbpedia.org/property/",
		"dbp-prop": "http://dbpedia.org/property/",
		"wdt": this.wdp.dt + "/",
		"wdtn": this.wdp.base + "direct-normalized/",
		"prov": "http://www.w3.org/ns/prov#",
		"wgs84": "http://www.w3.org/2003/01/geo/wgs84_pos#",
		"mads": "http://www.loc.gov/mads/rdf/v1#",
		"locid": "http://id.loc.gov/vocabulary/identifiers/",
		"recinfo": "http://id.loc.gov/ontologies/RecordInfo#",
		"bflc": "http://id.loc.gov/ontologies/bflc/",
		"chgset": "http://purl.org/vocab/changeset/schema#",
		"sacs": "http://data.e-stat.go.jp/lod/terms/sacs#",
		"imi": "http://imi.go.jp/ns/core/rdf#",
	};
	if(snqdef_map){
		//Snorqldef.askex can define more LOD proc mapping
		for(var keypat in snqdef_map.pat2proc) this.pat2proc[keypat] = snqdef_map.pat2proc[keypat];
		//additionally nspfx mapping can be added to this.exns
		var morens = snqdef_map.exns;
		if(morens) for(var pfx in morens) this.exns[pfx] = morens[pfx];
	}
	
};

//AskExternal functions
AskExternal.prototype ={
	/**
	 * ask external endpoint to add more info for LOD values about current target uri
	 * @param {DOMNode} div	<div> element to append resulting information table
	 * @return {Boolean}	true if uri pattern is matched and subdiv generated
	 */
	proc: function(div){
		if(this.app.is_home_uri === true){
			return false;
		}else if(typeof(this.app.is_home_uri) === "string"){
			console.log(this.app.is_home_uri, div);
			return false;
		}
		var marr,	//matched array of patkey regex match
		subdiv = Util.dom.element("div");	//div element to append resulting table and/or processing message
		this.tgsdiv = subdiv;	//target subdiv
		//this.pat2proc is defined in constructor
		for(var patkey in this.pat2proc) if(marr = this.tguri.match(new RegExp("^" + patkey))){
			//patkey is a uri pattern, this.pat2proc[patkey] is a function to be excuted for corresponding key
			if(this.pat2proc[patkey](this, marr)){
				this.app.is_home_uri = this.pat2proc[patkey].name;
				return add_subdiv(subdiv);
			}
		}
		if(this.app.rdfjson){
			if(AskExProc.ask_license_def(this, subdiv)) return add_subdiv(subdiv);
		}
		return false;
		
		function add_subdiv(subdiv){
			div.appendChild(subdiv);
			return true;
		}
	},
	
	
	////@@ processing methods called from AskExProc ///////////////////
	
	/**
	 * common handler to ask more query and append the resulting table.
	 * @param {String} siglabel	a signature label to show processing info
	 * @param {Array} nsmap	list of nspfx to add to this.snorql.more_ns from this.exns
	 * @param {String} query	query to get the information
	 * @param {String} endpoint	optional endpoint URI when asking to external store
	 * @param {String} accept	optional accept parameter
	 * @param {Boolean} as_virtuoso	true if force to use virtuoso preamble
	 * @return {Boolean}	always true
	 */
	query_and_proc: function(siglabel, nsmap, query, endpoint, accept, as_virtuoso){
		var that = this, service;
		if(endpoint){
			service = new SPARQL.Service(endpoint);
			service.setMethod("GET");
			service.setRequestHeader("Accept", accept || "application/sparql-results+json,*/*");
			this.notice_proc_external(siglabel);
		}else service = this.qh.set_service();
		if(nsmap) this.add_nsmap(nsmap);
		if(as_virtuoso) this.app.is_virtuoso = true;	//change setting, assuming no more request is needed for base endpoint

		this.app.qh.handler(service, query, function(json){
			var cres, res;
			if(!(cres = that.qh.check_res(json, "results from " + siglabel, "", that.subdiv, true))) return that.notice_nores(siglabel);
			if(cres[0] === "rdfjson") res = json;
			else res = that.app.any2RDFJson(json);
			/*
			else if(json.head.vars.includes("subject")) res = that.app.wdToRDFJson(json);
			else if(json.head.vars.includes("Subject")) res = that.app.wdToRDFJson(json, true);
			else res = that.app.toRDFJson(json);
			*/
			//console.log(query, json, res);
			that.proc_set_newrdfdiv(res, siglabel, endpoint ? true : false);
		});
		return true;
	},
	/**
	 * general method to use rdf distiller and process resulting rdf/json or nt
	 * @param {String} siglabel	a signature label to show processing info
	 * @param {Array} nsmap	list of nspfx to add to this.snorql.more_ns from this.exns
	 * @param {Boolean} tguri_only	true if want to process target (this.tguri) equv uri in result RDF/JSON
	 * @param {String} trim_ext	file extension part to be trimed from target uri
	 * @return {Boolean}	always true
	 */
	distill_and_proc: function(siglabel, nsmap, tguri_only, trim_ext){
		this.prepare_proc(siglabel, nsmap);
		var restype = "json",	//json|text if use N-Triples
		disturi = this.prep_distiller_uri(this.tguri, restype);
		this.fetch_and_proc_rdf(disturi, restype, siglabel, tguri_only, trim_ext);
		return true;
	},
	/**
	 * general method to get N-Triples, convert to rdf/json, and process the result
	 * @param {String} siglabel	a signature label to show processing info
	 * @param {Array} nsmap	list of nspfx to add to this.snorql.more_ns from this.exns
	 * @param {Boolean} tguri_only	true if want to process target (this.tguri) equv uri in result RDF/JSON
	 * @param {String} trim_ext	file extension part to be trimed from target uri
	 * @return {Boolean}	always true
	 */
	getnt_and_proc: function(siglabel, nsmap, tguri_only, trim_ext){
		this.prepare_proc(siglabel, nsmap);
		this.fetch_and_proc_rdf(this.tguri, "text", siglabel, tguri_only, trim_ext);
		return true;
	},
	
	////@@ real workers used by processing methods ///////////////////
	
	/**
	 * request RDF/JSON or N-Triples and process the result
	 * @param {String} uri	request URI that returns RDF/JSON or N-Triples
	 * @param {String} restype	response type of request: text for N-Triples, json for RDF/JSON
	 * @param {String} siglabel	a signature label to show processing info
	 * @param {Boolean} tguri_only	true if want to process target (this.tguri) equv uri in result RDF/JSON
	 * @param {String} trim_ext	file extension part to be trimed from target uri
	 */
	fetch_and_proc_rdf: function(uri, restype, siglabel, tguri_only, trim_ext){
		var that = this;
		Util.xhr.get(uri, function(res){
			if(!res) return that.notice_nores(siglabel) ;//failed to get rjson via distiller, for maybe no https proxy
			var myrdf = {},
			rjson = restype ==="text" ? Util.ntparser(res) : res,
			//trim file extension that is not part of the target uri
			tguri = that.tguri.replace(/\.(rdf|xml|json(ld)?|ttl|nt)$/, "");
			if(trim_ext) tguri = tguri.replace(new RegExp(trim_ext + "$"), "");	//eg. .madsrdf for lcnames
			//in case that the target URI is https while fetched RDF's URI is http
			if(!rjson[tguri] && tguri.match(/^https/)) tguri = tguri.replace(/^https/, "http");
			//select the rdf object of target uri. e.g. VIAF also returns rdf from participating libraries
			myrdf[tguri] = rjson[tguri];
			if(!tguri_only) for(var uri in rjson){
				if(uri === tguri) continue;
				myrdf[uri] = rjson[uri];
			}
			that.proc_set_newrdfdiv(myrdf, siglabel, true);
		}, function(status, mes, xreq){
			//console.log(xreq);
			that.notice_nores(siglabel, "failed to get description from ");
		}, restype);
	},
	/**
	 * processes the result rdfjson and append new table to the parent subdiv
	 * @param {Object} newrdf	RDF/JSON description of the target
	 * @param {String} siglabel	a signature label to show processing info
	 * @param {Boolean} has_external	non null if the result was obtained from external endpoint
	 */
	proc_set_newrdfdiv: function(newrdf, siglabel, has_external){
		//be careful! rdfjson is replaced
		this.app.saved.rdfjson.push(this.app.rdfjson);
		//console.log(json);
		//wikidata returns normal results
		this.app.rdfjson = newrdf;
		this.app.uris.proced = [];
		//var newdiv = this.app.format();
		this.app.format(this.tgsdiv);	//directly add a table to the parent div
		if(has_external){
			//remove processing message <p> which was set only for external query
			this.tgsdiv.removeChild(this.tgsdiv.firstChild);
			//now this.tgsdiv.firstChild is the generatd table
			if(this.tgsdiv.hasChildNodes())
			this.tgsdiv.firstChild.firstChild.innerText += " (Description from " + siglabel + ")";	//update table caption
		}
	},
	
	////@@ misc methods ///////////////////
	/**
	 * get distiller uri to have RDF/JSON or N-Triples instead of serialized rdf
	 * @param {String} uri	target URI that returns RDF neither in RDF/JSON nor SPARQL result JSON
	 * @param {String} restype	response type of request: text for N-Triples, json for RDF/JSON
	 * @return {String}	distiller_uri
	 */
	prep_distiller_uri: function(uri, restype){
		return (restype === "text" ?
			"https://rdf-translator.appspot.com/convert/detect/nt/" :
			Util.uri.https_proxy() + "http://rdf.greggkellogg.net/distiller?command=serialize&output_format=rj&raw&url="
		) + encodeURIComponent(uri);
	},
	/**
	 * common preparation
	 * @param {String} siglabel	a signature label to show processing info
	 * @param {Array} nsmap	list of nspfx to add to this.snorql.more_ns from this.exns
	 */
	prepare_proc: function(siglabel, nsmap){
		this.notice_proc_external(siglabel);
		if(nsmap) this.add_nsmap(nsmap);
	},
	/**
	 * processing notifier
	 * @param {String} siglabel	a signature label to show processing info
	 */
	notice_proc_external: function(siglabel){
		this.tgsdiv.innerHTML = "<p>asking to " + siglabel + " ... " + this.app.img_elt_tag("spinner") + "</p>";
	},
	/**
	 * no-result notifier
	 * @param {String} siglabel	a signature label to show processing info
	 */
	notice_nores: function(siglabel, msg){
		if(this.tgsdiv.firstChild)
		this.tgsdiv.firstChild.innerText = "(" + (msg || "no description from ") + siglabel +")";
		return false;
	},
	/**
	 * add nspfx mapping to more_ns so that properties can be displayed as qname
	 * @param {Array} nsmap	list of ns pfxs taken from this.exns keys
	 */
	add_nsmap: function(nsmap){
		nsmap.forEach(function(key){
			this.snorql.more_ns[key] = this.exns[key];
		}, this);
	}
};

////@@ query drivers for each LOD ///////////////////
//driver procedures are defined here separately from AskExternal so that it's possible to extend in Snorqldef.askex_map
var AskExProc = {
	//a driver proc is called from AskExternal.proc, according to AskExternal.pat2proc key (URI pattern)
	//1st argument is always the calling AskExternal instance, and optional 2nd arg is matched array of the uri pattern
	//ここに含まれないLODを取得するには、Snorqldef.askex_mapに{uripattern : function()}の形で処理を追加定義できる。functionには第1引数としてAskExternalが渡されるので、それを使ってsnorql_ldbの機能を利用できる。uripatternに後方参照()があれば、第2引数で参照できる。
	//see bellow for general example to get appropriate description from external target uri (current described uri)
	/////
	//★if the target uri returns RDF representation, use distill_and_proc() to get RDF/JSON from any syntax
	/**
	 * add more info for VIAF resources
	 * @param {Object} aex	calling AskExternal instance
	 * @return {Boolean}	always true
	 */
	ask_viaf: function(aex){
		return aex.distill_and_proc("VIAF", ["dbp-owl","dbp-propj"], true);
	},
	//★if the target uri description is provided through SPARQL endpoint, use query_and_proc()
	/**
	 * add more info for e-stat sac code
	 * @param {Object} aex	calling AskExternal instance
	 * @return {Boolean}	always true
	 */
	ask_sac: function(aex){
		//describe <uri> returns serialized rdf -> select spo
		var query = "select ?s ?p ?o where{{bind(<" + aex.tguri + "> as ?s) ?s ?p ?o} union "+
		"{<" + aex.tguri + "> <http://data.e-stat.go.jp/lod/terms/sacs#latestCode> ?s. ?s ?p ?o}} limit 200";
		return aex.query_and_proc("e-Stat", ["sacs","imi"], query, "https://data.e-stat.go.jp/lod/sparql/alldata/query");
	},
	//★if the uri pattern contains () reference, matched array is provided through 2nd argument
	/**
	 * add more info for DBpedia resources
	 * @param {Object} aex	calling AskExternal instance
	 * @param {Array} marr	matched array of the uri pattern
	 * @return {Boolean}	always true
	 */
	ask_dbpedia: function(aex, marr){
		var lang = marr[1],
		query = "select ?s ?p ?o where{bind(<" + aex.tguri + "> as ?s) ?s ?p ?o" + (lang ? "":
		" . filter(isURI(?o) || (isLiteral(?o) && (!lang(?o) || lang(?o)=\"ja\" || lang(?o)=\"en\")))") + "}",
		prx = Util.uri.https_proxy(),
		endpoint = lang ? prx + "http://" + lang + "dbpedia.org/sparql" : "https://dbpedia-live.openlinksw.com/sparql";
		//https://dbpedia.org/sparql has some problems with bind
		//dbpedia-j does not accept https request
		return aex.query_and_proc("DBpedia", ["dbp-owl", "dbp-propj", "dbp-prop", "prov", "wgs84"], query, endpoint);
	},
	
	/**
	 * add more info for NDLA resources
	 * @param {Object} aex	calling AskExternal instance
	 * @return {Boolean}	always true
	 */
	ask_ndla: function(aex){
		var requri = aex.tguri.replace(/entity/, "ndlna");
		if(requri !== aex.tguri){
			//request uri is different from original target, and set primary uri to that one
			//NDLAにおいてentityはndlnaからprimaryTopicで繋がれるため、ndlnaをprimaryにしないとテーブルが分解される
			aex.app.uris.primary = requri;	//
			requri += "> <" + aex.tguri;
		}
		//use ARC2 rather than virtuoso to get rdf/json (virtuoso returns json-ld) -> OK now
		//no proxy required since 2021
		return aex.query_and_proc("NDLA", null, "describe <" + requri + ">", "https://id.ndl.go.jp/auth/ndla/sparql");
	},
	/**
	 * add more info for Wikdata resources w/ prop labels
	 * @param {Object} aex	calling AskExternal instance
	 * @return {Boolean}	always true
	 */
	ask_wikidata: function(aex){
		var query = "CONSTRUCT{\n" +
			//Wikidata resource property values
			"\t<" + aex.tguri + "> ?p ?o ; rdfs:label ?slabel ; schema:description ?desc .\n" +
			"\t\t?o rdfs:label ?olabel.\n" +
			//extra triples to represent property labels -> handled by set_object_tdval
			"\t<" + aex.app.xplabeluri + "> ?p ?plabel .\n" +
		"} WHERE {\n\t{\n" +
			"\t<" + aex.tguri + "> ?p ?o .\n" +
			"\tFILTER(strstarts(str(?p), \"" + aex.wdp.dt + "\"))\n" +
			"\tBIND(IRI(replace(str(?p), \"" + aex.wdp.dt + ".*?/\", \"http://www.wikidata.org/entity/\")) as ?pent)\n" +
			"\t?pent rdfs:label ?plabel . FILTER(lang(?plabel)=\"ja\")\n" +
			"\tOPTIONAL {\n\t\tFILTER(isIRI(?o))\n\t\t?o rdfs:label ?olabel . FILTER(lang(?olabel)=\"ja\")\n\t}\n\t} UNION " +
			"{\n\t\t<" + aex.tguri + "> schema:description ?desc ; rdfs:label ?slabel .\n" +
			"\t\tFILTER(lang(?desc)=\"ja\")\n\t\tFILTER(lang(?slabel)=\"ja\" || lang(?slabel)=\"en\")\n" +
		"\t}\n}\n";
		//aex.app.props.thumb = aex.exns.wdt + "P18";
		return aex.query_and_proc("Wikidata", ["wdt", "wdtn"], query, "https://query.wikidata.org/sparql");
	},
	/**
	 * add more info for LoC resources
	 * @param {Object} aex	calling AskExternal instance
	 * @return {Boolean}	always true
	 */
	ask_lcnames: function(aex){
		aex.distill_and_proc("Library of Congress", ["mads","locid", "recinfo", "bflc", "chgset"], false);
		return true;
	},
	/**
	 * generic (version independent) lisence description
	 * @param {Object} aex	calling AskExternal instance
	 * @return {Boolean}	true if target license has generic license
	 */
	ask_license_def: function(aex){
		var defv,
		tgrs = aex.app.rdfjson[aex.tguri];
		//defuri = aex.app.rdfjson[aex.tguri][aex.app.snorql.more_ns.dct + "isVersionOf"][0].value;
		//only for license description
		if(!aex.rstypes.includes(aex.app.rdftype)){
			if(!["WebPage"].includes(aex.app.rdftype)) return false;
			defv = tgrs[aex.app.ns.rdfs + "seeAlso"];
		}else{
			var dct = aex.snorql.more_ns.dct,
			skos = aex.app.ns.skos;
			defv = tgrs[aex.app.ns.owl + "sameAs"] || tgrs[dct + "isReplacedBy"] || tgrs[dct + "isVersionOf"] || tgrs[skos + "exactMatch"] || tgrs[skos + "closeMatch"] || tgrs[skos + "relatedMatch"];
		}
		if(!defv) return false;
		
		var defuri = [];
		defv.forEach(function(v){defuri.push("<" + v.value +">");});
		//if it has owl:sameAs, dct:isReplacedBy or dct:isVersionOf
		var query = "select ?s ?p ?o where{values ?s {" + defuri.join(" ") +"} ?s ?p ?o}";
		return aex.query_and_proc("License", null, query);
	},
	
	//see Snorqldef.askex for more rdf resolvers
};

/**
 * Generic Query Handler
 * @param {object} jrdf	parent object
 */
var GnrQueryHandler = function(jrdf){
	this.app = jrdf;	//calling JsonRDFFormatter instance
	this.service = null;	//SPARQL.Service object
	this.endpoint = jrdf.snorql._endpoint;	//current endpoint
	this.logs = [];	//internal array to save warning quietly
};
//GnrQueryHandler functions
GnrQueryHandler.prototype = {
	/**
	 * prepare SPARQL.Service instance
	 * @param {String} method	query http method
	 * @return {Object}	SPARQL.Service
	 */
	set_service: function(method){
		if(!this.service){
			this.service = new SPARQL.Service(this.endpoint);
			this.service.setMethod(method || "GET");
			this.service.setRequestHeader("Accept", "application/sparql-results+json,*/*");
			this.service.setOutput("json");
		}
		return this.service;
	},
	/**
	 * generic query handler
	 * @param {Object} service	SPARQL endpoint service
	 * @param {String} query	SPARQL query
	 * @param {function} success_fnc	function to excute when success. usually include that.qh.check_res()
	 * @param {DOMNode} msgarea	optional element to display message
	 */
	handler: function(service, query, success_fnc, msgarea){
		var that = this;
		this.last_query = query;
		if(!service) service = this.set_service();
		if(query.match(/^describe/i)) query = Util.queries.preamble(query, "DESCRIBE", this.app.is_virtuoso);
		service.query(query, {
			"success": success_fnc,
			"failure": function(res){
				var msg = "query request failed:";
				if(msgarea) that.disp_error_msg(msgarea, msg);
				else that.log_error_msg(msg, res, true);
			}
		});
	},
	/**
	 * generic query result checker with several standard error messages handling
	 * @param {Object} json	query results
	 * @param {String} job_label	label of current job to generate message string on error
	 * @param {String} job_target	target label of current job
	 * @param {DOMNode|Boolean} msgarea	optional element to display message, or true if only show console log
	 * @param {Boolean} test_rdfjson	set true if results format is RDF/JSON, not SPARQL json res
	 * @return {Array|Boolean|Integer}	results.bindings (or RDF/JSON) if success, 0 if 0 bindings, false if some errors. If test_rdfjson is set, returns array [type, results] where type is "rdfjson" or "bindings"
	 */
	check_res: function(json, job_label, job_target, msgarea, test_rdfjson){
		var that = this,
		jobinfo = " " + job_label + (job_target ? " for " + job_target : "");
		//failed or error response
		if(!json){
			return error_msg("[query error: no response on" + jobinfo + "]", "", true);
		}else if(json.status && json.status === "error"){
			var errmsg = "ajax error on" + jobinfo
			if(msgarea) this.disp_error_msg(msgarea, errmsg + ": " + json.response);
			return this.log_error_msg(errmsg, json, true);
		}
		//response is OK
		if(test_rdfjson && !json.head){
			//consider result is RDF/JSON if no head presents
			return ["rdfjson", json];
		}else if(json.head && json.head.status === "error"){
			//got reponse but some errors in query, etc.
			return error_msg("query error on" + jobinfo + ": " + json.head.msg, "", true);
		}else if (json.results.bindings.length === 0){
			//empty result. returns 0 instead of false, so that calling handlers can set no value results e.g. test_url_type
			if(!job_label) return 0;	//quiet
			var notfound_msg = "no" + jobinfo + " found";
			if(this.app.is_home_uri){
				error_msg(notfound_msg + (job_target ? "" : " for this resource"));
			}else if(this.app.uris){
				error_msg("", job_target ? notfound_msg : "no " + job_label + " found for <a href=\"" + this.app.uris.tgrsrc + "\">this resource</a>.");
			}else{
				error_msg(notfound_msg);
			}
			return 0;
		}
		//seems to have meaningful results
		return test_rdfjson ? ["bindings", json.results.bindings] : json.results.bindings;
		
		//treat message according to the setting. return value is always false
		function error_msg(msg, html, is_warning){
			if(msgarea){
				return (msgarea === true) ? 
				that.log_error_msg(msg, json, is_warning) :	//if msgarea is true, simply log to console
				that.disp_error_msg(msgarea, msg, html);	//otherwise, display message in the msgarea
			}else{
				//if no msgarea is provided
				return is_warning ?
				that.log_error_msg(msg, json, is_warning) :	//log to console if error
				push_log(msg, json)	//otherwise log to internal array
			}
		}
		//save log info in internal array, not disturbing console
		function push_log(msg, json){
			that.logs.push({"message": msg, "object": json});
			return false;
		}
	},
	/**
	 * display error message on display
	 * @param {DOMNode} msgarea	element to show the message
	 * @param {String} msg	error message plain string
	 * @param {String} html	error message HTML markup
	 */
	disp_error_msg: function(msgarea, msg, html){
		if(html) msgarea.innerHTML = html;
		else msgarea.innerText = msg;
		msgarea.className = "";
		return false;
	},
	/**
	 * log message to console
	 * @param {String} msg	a message string
	 * @param {Object} obj	an object related to the message
	 * @param {Boolean} is_warning	true if this is a warning message
	 */
	log_error_msg: function(msg, obj, is_warning){
		if(is_warning) console.warn(msg, obj);
		else console.log(msg, obj);
		return false;
	}
}


////@@ SELECT query result handler /////////////////////////////////////////

/**
 * a better table formatter for SPARQL select result
 * extention of Snorql.SPARQLResultFormatter (displays SELECT/ASK results)
 * @param {Object} json	SPARQL results in JSON format
 * @param {Object} namespaces	default nspfx to nsuri mapping
 * @param {Object} snorql	calling object, i.e. instance of Snorql class
 */
function SPARQLSelectTableFormatter(json, namespaces, snorql){
	//snorql reslt formatter that has rendering methos e.g. _getLinkMaker, _formatNode...
	this.sq_formatter = new SPARQLResultFormatter(json, namespaces, snorql);
	//each tboby has rows to show in one unit (per std_tbl_rows)
	this.tbody = [];
	var sqr = Snorqldef.sqr || {};	//Snorqldef object to override default
	//number of rows to show in one unit
	if(snorql.uqparam.mode && snorql.uqparam.mode === "min"){
		//for smaller display presentation. 2021-03-06
		this.std_tbl_rows = 15;
		Util.lang_limit = [60, 120, 70, 65];
		Util.lang_trim_offset = [[30, 25], [80, 30], [38, 23], [32, 20]];
		document.body.classList.add("min");
	}else if(Number(snorql.uqparam.numpage)) this.std_tbl_rows = Number(snorql.uqparam.numpage);
	else this.std_tbl_rows = sqr.std_tbl_rows || 20;
	//options to switch num rows in one unit
	this.rows_option = sqr.rows_option || [this.std_tbl_rows, 50, 100];
	this.row_count = 0;
	this.inc = null;
	this.ns = namespaces;
	this.snorql = snorql;
	this.qh = new GnrQueryHandler(this);
}
//////functions of SPARQLSelectTableFormatter
SPARQLSelectTableFormatter.prototype = {
	/**
	 * generates result HTML table and title etc.
	 * @param {Object} div	HTML div element to append result table
	 * @param {Boolean} noTitle	true if no title element needed (when called from AddExtraInfo.osp)
	 */
	toDOM: function(div, noTitle) {
		//var is_count;	//where the query includes count var (aggregate query);
		this.table = Util.dom.element("table");
		this.table.className = "queryresults";
		//if(!noTitle) is_count = Util.set_title(this, "SELECT", this.sq_formatter);
		//where the query includes count var (aggregate query);
		var is_countq = Util.set_title(this, "SELECT", this.sq_formatter, noTitle);
		//optimize style depending on the number of vars
		var ncols = this.sq_formatter._variables.length;
		if(ncols > 4) this.table.classList.add("plus5");
		else if(ncols > 2) this.table.classList.add("plus3");
		//generate table
		var theadr = this.sq_formatter._createTableHeader();
		this.table.appendChild(theadr);
    	this.create_tbody(this.table, theadr, is_countq);
		//if num of results > std_tbl_rows prepare increment controls
		this.inc_ctrl = this.setup_inc_ctrl(this.table);
		if(this.inc_ctrl){
			div.appendChild(this.inc_ctrl[0]);
			div.appendChild(this.table);
			if(this.inc_ctrl[1]) div.appendChild(this.inc_ctrl[1]);
		}else div.appendChild(this.table);
		Util.queries.add_countq();
	},
	/**
	 * create tbody element to group up some result rows (in order to show/hide each group)
	 * to be called from toDOM() function
	 * @param {DOMNode} table	table element node to append tbody's
	 * @param {DOMNode} theadr	thead element node
	 * @param {Boolean} is_countq	whether query contains conut()
	 */
	create_tbody: function(table, theadr, is_countq){
		var tbpos = -1,
		cis_tds = {},	//counted item subject td's
		top_var = this.sq_formatter._variables[0],	//name of the first variable
		count_sum = 0;
		this.row_count = this.sq_formatter._results.length;
		this.sq_formatter._results.forEach(function(resul, i){
			if(i % this.std_tbl_rows === 0){
				this.tbody.push(Util.dom.element("tbody"));
				tbpos++;
				table.appendChild(this.tbody[tbpos]);
				if(tbpos) this.tbody[tbpos].className = "wait";
			}
			if(Object.keys(resul).length === 0) console.log("no item in row ", i);
			else{
				var row = this.sq_formatter._createTableRow(resul, i);
				//prepare for add_elabels if var is uri
				if(!resul[top_var]) ; //same mistype varname as snorql._createTableRow
				else if(resul[top_var].type === "uri") cis_tds[resul[top_var].value] = row.firstChild;
				this.tbody[tbpos].appendChild(row);
				if(is_countq && resul.count) count_sum += Number(resul.count.value);	//2020-12-13
			}
		}, this);
		if(is_countq){
			this.add_elabels(cis_tds, table, theadr);
			var cpos = this.sq_formatter._variables.indexOf("count");
			if(cpos > -1) theadr.childNodes[cpos].title = "total count = " + count_sum;
		}
	},
	/**
	 * setup increment controls for table view, to be called from displayJSONResult() function
	 * @param {DOMNode} table	target table node
	 * @param {Integer} offset	SPARQL offset modifier value
	 * @return {Array}	a pair of increment control <p> node
	 */
	setup_inc_ctrl: function(table, offset){
		if(typeof offset === "undefined") offset = 0;
		//if number of result rows is smaller than view rows, no need to create the control
		if(this.row_count <= this.std_tbl_rows){
			var dispres = this.row_count + " result" + (this.row_count > 1 ? "s": "");
			return [Util.dom.element("span", dispres, [["class", "ctrl0"]])];
		}
		var that = this,
		ctrlparam = {
			left: {text: "≪ prev", dir: -1, inistate: "wait"},
			right: {text: "next ≫", dir: +1, inistate: "active"},
			unit: this.std_tbl_rows,
			from: offset + 1,
			to: offset + this.std_tbl_rows,
			all: offset + this.row_count
		},
		ctrls = this.create_inc_ctrl(ctrlparam),
		switcher = Util.dom.element("span", "show all");
		
		this.inc = {
			ctrl: ctrls,
			showpos: 0,
			maxpos: Math.floor((this.row_count - 1) / ctrlparam.unit),
			unit: ctrlparam.unit,
			all: ctrlparam.all,
			offset: 0
		};
		
		//2019-02-11
		switcher.className = "switcher";
		switcher.addEventListener("click", function(ev){
			if(table.classList.contains("showall")){
				table.classList.remove("showall");
				ev.target.innerText = "show all";
			}else{
				table.classList.add("showall");
				ev.target.innerText = "collapse";
			}
		}, false);
		ctrls[1].p.appendChild(this.gen_tbrchanger());
		ctrls[1].p.appendChild(switcher);
		return [ctrls[0].p, ctrls[1].p];
	},
	/**
	 * create actual increment conrol elements
	 * @param {Object} param	setup parameters
	 * @return {Array}	a pair of increment control objects
	 */
	create_inc_ctrl: function(param){
		var that = this, ctrls = [];
		//creates two controls both for the above and the below table
		for(var i=0; i<2; i++){
			var ctrl = {
				p: Util.dom.element("p"),
				status: Util.dom.element("span")
			};
			ctrl.p.className = "incCtrl ctrl" + i;
			ctrl.status.appendChild(
				Util.dom.text(" " + param.from + " - " + param.to + " / " + param.all + " ")
			);
			["left", "right"].forEach(function(key){
				ctrl[key] = Util.dom.element("span");
				ctrl[key].appendChild(Util.dom.text(param[key].text));
				ctrl[key].className = "pseudolink " + param[key].inistate;
				ctrl[key].addEventListener("click", function(){that.set_view(param[key].dir);}, false);
			});
			ctrl.p.appendChild(ctrl.left);
			ctrl.p.appendChild(ctrl.status);
			ctrl.p.appendChild(ctrl.right);
			ctrls.push(ctrl);
		}
		return ctrls;
	},
	/**
	 * generates select element to change number of rows to display
	 * @return {DOMNode}	select element
	 */
	gen_tbrchanger: function(){
		var that = this,
		sel = Util.dom.element("select");
		this.rows_option.forEach(function(num){
			var opt = Util.dom.element("option", num);
			if(that.std_tbl_rows === num) opt.setAttribute("selected", "selected");
			sel.appendChild(opt);
		});
		sel.addEventListener("change", function(ev){
			var formatter = that,
			selnum = Number(ev.target.value);
			if(selnum !== that.std_tbl_rows) that.reset_tbody(selnum);
		});
		return sel;
	},
	/**
	 * change table view (displayed rows), called by increment control elements
	 * @param {Integer} direction	increment the disp rows if +1, decrement if -1
	 */
	set_view: function(direction){
		if(direction < 0 && this.inc.showpos > 0){
			this.tbody[this.inc.showpos--].classList.add("wait");
			this.tbody[this.inc.showpos].classList.remove("wait");
			for(var i=0; i<2; i++){
				if(this.inc.showpos === 0) this.inc.ctrl[i].left.classList.add("wait");
				if(this.inc.showpos === this.inc.maxpos - 1){
					this.inc.ctrl[i].right.classList.remove("wait");
				}
			}
		}else if(direction > 0 && this.inc.showpos < this.inc.maxpos){
			this.tbody[this.inc.showpos++].classList.add("wait");
			this.tbody[this.inc.showpos].classList.remove("wait");
			for(var i=0; i<2; i++){
				if(this.inc.showpos === 1) this.inc.ctrl[i].left.classList.remove("wait");
				if(this.inc.showpos === this.inc.maxpos){
					this.inc.ctrl[i].right.classList.add("wait");
				}
			}
		}else return;
		
		for(var i=0; i<2; i++) this.inc.ctrl[i].status.innerText = " " + 
		(this.inc.showpos * this.inc.unit + this.inc.offset + 1) + " - "
		+ (Math.min((this.inc.showpos+1) * this.inc.unit, this.row_count) + this.inc.offset)
		+ " / " + this.inc.all + " ";
	},
	/**
	 * changes the number of rows to display
	 * @param {Integer} numrows	number of rows to display
	 */
	reset_tbody: function(numrows){
		this.std_tbl_rows = numrows;
		var table = this.table,
		trs = [],
		tbpos = -1;
		//remove current rows
		for(var tb=0, tbn=this.tbody.length; tb<tbn; tb++){
			if(this.tbody[tb].parentNode === table){
				table.removeChild(this.tbody[tb]);
				var tr;
				while((tr = this.tbody[tb].firstChild)) trs.push(this.tbody[tb].removeChild(tr));
			}
		}
		//reorganize tbodies
		this.row_count = trs.length;
		for(var i=0; i <this.row_count ; i++) {
			if(i % this.std_tbl_rows === 0){
				if(!this.tbody[++tbpos]) this.tbody.push(Util.dom.element("tbody"));
				table.appendChild(this.tbody[tbpos]);
				if(tbpos === 0) this.tbody[tbpos].classList.remove("wait")
				else this.tbody[tbpos].className = "wait";
			}
			this.tbody[tbpos].appendChild(trs[i]);
		}
		//reset controls
		var inc_ctrl = this.setup_inc_ctrl(table);
		if(inc_ctrl){
			var div = this.inc_ctrl[0].parentNode;
			div.replaceChild(inc_ctrl[0], this.inc_ctrl[0]);
			div.replaceChild(inc_ctrl[1], this.inc_ctrl[1]);
			this.inc_ctrl = inc_ctrl;
		}
	},
	/**
	 * add English labels for counted item subject td's
	 * @param {Object} cis_tds	object that holds counted item subject td elements w/ 1st col value as a key
	 * @param {DOMNode} table	table element node of results display
	 * @param {DOMNode} theadr	thead element node
	 */
	add_elabels: function(cis_tds, table, theadr){
		var keyarr = Object.keys(cis_tds);
		if(keyarr.length === 0) return;	//only if uri vars
		else if(keyarr.length > 1000) keyarr = keyarr.slice(0, 999);
		var that = this,
		enlbl = " en labels",
		query = "SELECT ?cv ?en WHERE{\n\tVALUES ?cv {\"" + keyarr.join('" "') + "\"}\n" +
			"\tBIND(IRI(?cv) as ?s)\n\t?s <http://schema.org/name> ?en . FILTER(lang(?en)=\"en\")\n}",
		service = this.qh.set_service("POST"),
		binds,
		add_label = function(res){
			if(!(binds = that.qh.check_res(res, "en labels"))) return false;
			binds.forEach(function(bind){
				var td = cis_tds[bind.cv.value],
				label = Util.str.trim(bind.en.value, 40, [36, 0]),
				span = Util.dom.element("span", label);
				span.className = "subtext";
				td.appendChild(span);
			});
		};
		//switcher
		var btn = Util.dom.element("span", "add" + enlbl, [["class", "subtext pseudolink"]]);
		btn.addEventListener("click", function(ev){
			var t = this.innerText;
			if(t.match(/^add/)) do_query();
			else if(t.match(/^show/)){
				table.classList.remove("nosubtext");
				this.innerText = "hide" + enlbl;
			}else{
				table.classList.add("nosubtext");
				this.innerText = "show" + enlbl;
			}
		});
		if(Util.ualang !== "ja") do_query();	//add later if ja
		theadr.firstChild.appendChild(btn);
		
		//get labels by query and add them
		function do_query(){
			that.qh.handler(service, query, add_label);
			btn.innerText = "hide" + enlbl;
		}
	}
};




////@@ Static utilities ////////////////////////////////////////////////////////

//Utilities to be called from any class
var Util = {
	//snorql_def.jsに記述しておき、Snorql.init_homedefで設定する
	homelabel: null,	//Snorql for %homelabel%
	datauri: "",
	//preferred language setting of the browser. changed to 'ualang' from 'ulang' 2021-02-10
	ualang: (navigator.userLanguage || navigator.language).substr(0, 2).toLowerCase(),
	//snorql_ldb's default language for displaying message. can override with Snorqldef.home.default_lang
	default_lang: "ja",
	//index to determine which element of multlang label will be used: 0=default, 1=other
	langidx: 0,
	//indicates whether JPS specific feature to be used
	is_jpscompat: null,
	ldb: {},	//Snorqldef.ldb
	homedef: null,	//snorql.homedef
	current_query: null,
	/**
	 * initialize Util properties. is called from snorql.init();
	 * @param {Object} homedef	Snorqldef.homedef + props added in snorql.init()
	 */
	init: function(homedef, elts){
		this.langidx = this.ualang === this.default_lang ? 0 : 1;
		this.homedef = homedef;	//homedef is at least {}
		if(typeof(homedef.uri) === "string"){
			this.is_jpscompat = homedef.uri.match(/(jpsearch\.go|cultural)\.jp/) ? true : false;
		}
		if(Snorqldef){
			if(Snorqldef.ldb) this.ldb = Snorqldef.ldb;
			if(Snorqldef.qtemplate) Util.queries.sd_templ = Snorqldef.qtemplate;
			if(Snorqldef.example){
				this.example.exdefs = Snorqldef.example;
				if(Snorqldef.example_ns) this.example.ns = Snorqldef.example_ns;
				this.example.spread_selector = ! homedef.example_selector_nospread;
			}
		}
		var ver = Util.dom.element("span", " " + _sldb_version, [["class", "misc"]]),
		footer = document.querySelector("footer");
		if(!footer) return;
		if(elts && elts.pwrdby) footer.insertBefore(ver, elts.pwrdby.nextSibling);
		else footer.appendChild(ver);
		this.map.init();
	},
	numformat: function(num, zeros){
		return (zeros + num).slice(- zeros.length);
	},
	//toggle classname of an element (e.g. called from 'image' <th> to toggle <table> class, set by _createTableHeader)
	cls_toggler: function(elt, classname){
		if(elt.classList.contains(classname)) elt.classList.remove(classname);
		else elt.classList.add(classname);
	},
	//easy DOM handlers
	dom: {
		byid: function(id){
			return document.getElementById(id);
		},
		element: function(elt, str, attr){
			var node = document.createElement(elt);
			if(str) node.innerText = str;	//2019-02-11
			if(attr) attr.forEach(function(at){node.setAttribute(at[0], at[1]);});	//2020-03-24
			return node;
		},
		text: function(str){
			return document.createTextNode(str);
		},
		sve: function(elt, attrs){
			var e = document.createElementNS("http://www.w3.org/2000/svg", elt);
			if(attrs) attrs.forEach(function(attr){e.setAttribute(attr[0], attr[1])});
			return e;
		},
		//table for describe query results
		prepare_desc_table: function(table){
			if(!table) table = this.element("table");
			table.classList.add("describe");
			var col = [this.element("col"), this.element("col")];
			col[0].className = "term";
			col.forEach(function(c){table.appendChild(c);});
			return table;
		}
	},
	ua_chrome: navigator.userAgent.match(/Chrome\/(\d+)\./),
	lang_limit: [80, 150, 110, 96],
	lang_trim_offset: [[38, 36], [90, 50], [50, 42], [40, 42]],
	/**
	 * trim long URI for display purpose (override snorql simple default)
	 * @param {DOMNode} elt	the element whose content to be the URI string
	 * @param {String} dispuri	URI to be displayed
	 * @param {Integer} numvars	number of select variables (more vars, shorter disp)
	 */
	url_disp: function(elt, dispuri, numvars){
		var limit = this.lang_limit[numvars] || this.lang_limit[0],
		offset = this.lang_trim_offset[numvars] || this.lang_trim_offset[0],
		len = dispuri.length;
		if(len < limit){
			elt.innerText = dispuri;
			return ;
		}
		elt.appendChild(this.dom.text(dispuri.substr(0, offset[0])));
		if(offset[1]){
			elt.appendChild(exspn(offset[0], len - offset[1] - offset[0]));
			elt.appendChild(this.dom.text(dispuri.substr(len - offset[1], offset[1])));
		}else{
			elt.appendChild(exspn(offset[0]));
		}
		function exspn(st, ed){
			var splitter = " ... ",
			trstr = ed ? dispuri.substr(st, ed) : dispuri.substr(st),
			span = Util.dom.element("span", splitter);
			span.className = "exspn";
			span.title = "expand \"" + trstr + "\"";
			span.addEventListener("click", function(ev){
				var o = ev.target;
				if(o.innerText === splitter){
					o.innerText = trstr;
					o.title = "collapse long uri";
					o.classList.add("expanded");
				}else{
					o.innerText = splitter;
					o.title = "expand \"" + trstr + "\"";
					o.classList.remove("expanded");
				}
				ev.stopPropagation();
				ev.preventDefault();
			});
			return span;
		}
		
	},
	/**
	 * link ctrl click modifier (override snorql simple default) 2021-01-31
	 * @param {DOMNode} node	the clicked element node
	 */
	url_ctrl_disp: function(node, ev){
		if(!ev.target.href || ev.target.classList.contains("prop")){
			//property name cell
			prompt("property URI", node.value);
		}else if(ev.target.href.match(/^\?describe=/)){
			//if node value to be described by sparql endpoint, show raw uri of the target
			prompt("value URI", node.value);
		}else{
			//if it is direct link, then show its description instead
			location.href = "?describe=" + encodeURIComponent(node.value);
		}
	},
	str: {
		sprintf: function(templ, replace_arr){
			replace_arr.forEach(function(rep, i){
				templ = templ.replace("%s" + i + "%", rep);
			});
			return templ;
		},
		trim: function(str, limit, offset){
			var len = typeof(str) === "string" ? str.length : 0;
			if(len > limit){
				str = str.substr(0, offset[0])
				+ " ..." + (offset[1] ? " " + str.substr((len - offset[1]), offset[1]) : "");
			}
			return str;
		},
		langtext: function(text){
			return text instanceof Array ? text[Util.langidx] : text;
		},
		uni_unescape: function(str){
			return str.replace(/\\u([a-fA-F0-9]{4})/g, function(mstr, mar1) {
				return String.fromCharCode(parseInt(mar1, 16));
			});
		}
	},
	hilite: function(elt){
		var m = elt.innerText.match(/\(excerpts re\. (\w+)\)/);
		if(!m) return;
		elt.innerHTML = elt.innerHTML.replace(new RegExp("(" + m[1] + ")", "ig"), "<em>" + RegExp.$1 + "</em>");
	},
	uri: {
		split: function(uri, local_only){
			var m = uri.match(/^(.+?[\/#])([^\/#]+)$/);
			return local_only ? m[2] : [m[1], m[2]];
		},
		qname2uri: function(qname, nsmap){
			var nslocal = qname.split(":");
			return nsmap[nslocal[0]] + nslocal[1];
		},
		https_proxy: function(test_ua){
			if(test_ua){
				var cv = Util.ua_chrome;
				if(!cv || cv[1] < 84) return "";	//only Chrome 84 or greater forces https image source
			}
			return location.href.match(/^http:\/\/localhost/) ? "" : (Snorqldef.ldb ? "https://ld.cultural.jp/app/prx/" : "");
		}
	},
	/**
	 * setup proper HTML title element. also check if the query contains conut()
	 * @param {Object} app	calling method object
	 * @param {String} qtype	querty type DESCRIBE|SELECT|..
	 * @param {Object} sqfobj	optional sq_formatter object
	 * @param {Boolean} test_countq_only	true if conut() query check only and not set title
	 * @return {Boolean}	true if the query contains conut()
	 */
	set_title: function(app, qtype, sqfobj, test_countq_only){
		if(!this.current_query){
			this.current_query = this.example.textarea ? this.example.textarea.value : "";
		}
		var title, is_countq;
		if(qtype === "SELECT"){
			var matched = this.current_query.match(/(SELECT .*?(count\(.*\))?,*?) ?(FROM|WHERE|\x7B)/i);
			is_countq = (matched && matched[2]);	//to be boolean ? "count:" : "";	//for count() query
			title = matched ? matched[1] : "";
			if(test_countq_only) return is_countq;
			if(sqfobj){
				var rows = sqfobj._results,
				row = rows[0],
				vars = sqfobj._variables,
				vlabel, vlocal, tpfx, foundpos, i = 0;
				for(var v in row){
					if(row[v].type === "literal"){
						vlabel = vars[i] + "=" + Util.str.trim(row[v].value, 12, [10, 0]);
						foundpos = i;
						break;
					}else if(row[v].type === "uri" && !vlocal){
						var m = row[v].value.match(/[#\/]([^#\/]+)\/?$/);
						if(m) vlocal = vars[i] + "=" + Util.str.trim(m[1], 18, [6, 6]);
					}
					i++;
				}
				if((tpfx = (vlocal ? (vlocal + (vlabel ? " (" + vlabel + ")" : "")) : vlabel))){
					tpfx = "📃" + (is_countq ? "count:" : "") + tpfx + (rows.length > 1 ? " etc": "");	//📜📚📋📝
					title = tpfx + " by " + title;
				}
			}
		}else if(qtype === "DESCRIBE"){
			var qname,
			matched = this.current_query.match(/DESCRIBE ([^ ]+)/i);
			if(matched[1].match(/^<(.*?)([^\/#]+)>/)){
				var pfx, local = RegExp.$2;
				if(this.datauri === RegExp.$1) pfx = ":";
				else for(var pfxc in app.ns){
					if(app.ns[pfxc] === RegExp.$1){
						pfx = pfxc + ":";
						break;
					}
				}
				qname = (pfx || "ns01:") + local;
			}else qname = matched;	//\"\"
			var title_sfx = "Description of " + Util.str.trim(qname, 50, [20, 20]);
			title = (app.title ? app.title + ": " : "") + title_sfx;
			description_microdata(app.uris.tgrsrc);//"✍" + 
			if(app.uris.img.length) this.set_twcards(app, app.uris.img, app.title || title_sfx);
		}else title = qtype;
		document.title = title + " - Snorql" + (this.homelabel ? " for " + this.homelabel : "");
		this.map.refresh();
		document.documentElement.setAttribute("lang", this.ualang==="ja" ? "ja" : "en");
		
		return is_countq;	//return whether the query includes count() function for add_elabels
		
		function description_microdata(uri){
			var docelt = document.documentElement,
			aboutlink = Util.dom.element("link");
			docelt.setAttribute("itemscope", "");
			docelt.setAttribute("itemid", location.href);
			docelt.setAttribute("itemtype", "http://schema.org/WebPage");
			aboutlink.setAttribute("itemprop", "about");
			aboutlink.setAttribute("href", uri);
			document.head.appendChild(aboutlink);
			document.querySelector("title").setAttribute("itemprop", "name");
		}
	},
	//set twitter cads elements in <head>. maybe useless since twitter seems not recognize generated content
	set_twcards: function(app, imguris, title){
		add_meta("property", "og:title", title);
		add_meta("name", "twitter:card", "summary");
		add_meta("name", "twitter:image:src", imguris[0]);
		
		function add_meta(prop, propv, contentv){
			var meta = Util.dom.element("meta");
			meta.setAttribute(prop, propv);
			meta.setAttribute("content", contentv);
			document.head.appendChild(meta);
		}
	},
	//very simple XHr handler (see add_img_plus_from_isbn)
	xhr:{
		getp: function(url, onsuccess){
			var that = this;
			return new Promise(function(onsuccess){
				that.get(url, onsuccess);
			});
		},
		get: function(url, onsuccess, onerror, reqtype){
			var xreq = new XMLHttpRequest();
			xreq.onreadystatechange = function(){
				if(xreq.readyState !== 4) return;
				if(xreq.status === 200) {
					var resvar = (xreq.responseType === "json") ? xreq.response: (
						(xreq.responseType === "text") ? xreq.responseText : xreq.JSON.parse(xreq.responseText)
					);
					onsuccess(resvar);
					return true;
				}else{
					if(onerror){
						onerror(xreq.status, xreq.statusText, xreq);
					}else{
						console.error(xreq.status, xreq.statusText, url);
					}
					return false;
				}
			}
			try{
				xreq.open("GET", url, true);
				xreq.responseType = reqtype || "json";
				xreq.send("");
			}catch(e){
				console.error(e);
			}
		}
	},
	//change link with a modifier key (eg. external link with a parameter)
	link_modifier: function(tgelt, url, modifier){
		var key = modifier || "Shift";
		tgelt.addEventListener("click", function(ev){
			if(ev.getModifierState(key)) location.href=url;
		});
	},
	misc: {
		rset: function(set, ofst){
			var sv = "https://";
			set.forEach(function(ch){sv += String.fromCharCode(ch + ofst);});
			return sv;
		}
	},
	//removed nav.save_uris, nav.test_saved
	//introduction to be displayed when no query
	intro: function(hdef, ressec, endpoint){
		var lang = this.ualang === "ja" ? 0 : 1,
		idef = hdef.intro,
		intro_tmpl = hdef.intro_tmpl || [
			"%s0%は、SPARQLクエリ構築支援と分かりやすい結果表示のために、%s1%を<a href=\"https://www.kanzaki.com/works/ld/jpsearch/snorql_ldb-about\">拡張したツール</a>です。",
			// "%s0%は、SPARQLクエリ構築支援と分かりやすい結果表示のために、%s1%を<a href=\"https://www.kanzaki.com/works/ld/jpsearch/snorql_ldb-about\">拡張したツール</a>です。アプリケーションからのSPARQLクエリには%s2%を利用してください。", 
			// "%s0% is an <a href=\"https://www.kanzaki.com/works/ld/jpsearch/snorql_ldb-about\">extension</a> of %s1% to make SPARQL query building easier and show results much understandable. Use %s2% for application query."
		],
		intro_bendp = hdef.intro_bendp || ["基本エンドポイント", "basic endpoint"],
		homelink = "<a href=\"" + hdef.uri + "\">" + hdef.label + "</a>",
		snorqllink = "<a href=\"https://github.com/kurtjx/SNORQL\">Snorql</a>",
		eplink = "<a href=\"" + endpoint + "\">" + intro_bendp[this.langidx] + "</a>";
		gen_elt(ressec, "p", Util.str.sprintf(intro_tmpl[this.langidx], ["Snorql for " + hdef.label, snorqllink, eplink]));
		if(idef){
			var ul = this.dom.element("ul");
			idef.forEach(function(v){
				gen_elt(ul, "li", Util.str.langtext(v));
			});
			ressec.appendChild(ul);
		}
		ressec.classList.add("intro");
		
		function gen_elt(pelt, type, html){
			var elt = Util.dom.element(type);
			elt.innerHTML = html;
			pelt.appendChild(elt);
		}
	},
	/**
	 * very simple N-Triples parser
	 * @param {String} ntliteral	N-Triples string
	 * @return {Object}	RDF/JSON object generated from input nt
	 */
	ntparser: function(ntliteral){
		var rdf = {};
		ntliteral.split(/[\r\n]+/).forEach(function(statement){
			var m, s, p, ox;
			if((m = statement.match(/^\s*<(.+?)>\s*<(.+?)>\s*(.+)/)) ||
				(m = statement.match(/^\s*(_:.+?)\s<(.+?)>\s*(.+)/))
			){
				s = m[1];
				p = m[2];
				ox = m[3];
			}else return;
			if(!rdf[s]) rdf[s] = {};
			if(!rdf[s][p]) rdf[s][p] = [];
			if((m = ox.match(/^\s*<(.+?)>/))){
				rdf[s][p].push({"type": "uri", "value": m[1]});
			}else if((m = ox.match(/^\s*(_:[^\s]+)/))){
				rdf[s][p].push({"type": "bnode", "value": m[1]});
			}else if((m = ox.match(/^\s*"(.+)"\s*\.\s*(#.*)?$/))){
				rdf[s][p].push({"type": "literal", "value": this.str.uni_unescape(m[1])});
			}else if((m = ox.match(/^\s*"(.+)"(\@([^ ]+)|\^\^<(.+?)>)\s*\.\s*(#.*)?$/))){
				var literal = {"type": "literal", "value": this.str.uni_unescape(m[1])};
				if(m[3]) literal.lang = m[3];
				else if(m[4]) literal.datatype = m[4];
				rdf[s][p].push(literal);
			}else{
				m = ox.match(/^\s*"(.+)"(.+)?/);
				console.log("ill-formed literal", ox, m);
				rdf[s][p].push({"type": "literal", "value": this.str.uni_unescape(m[1])});
			}
		}, this);
		return rdf;
	}
};
//query example setter. provide examples in snoral_def.js
Util.example = {
	queries: [],
	ns: {},	//Snorqldef.example_ns, to be set by Util.init
	exdefs: null,	//Snorqldef.example, to be set by Util.init
	textarea: null,
	tadiv: null,
	spread_selector: null,	//set by init()
	spread_minw: 1100,
	/**
	 * prepare query example popup menu. called from snorql.start
	 * @param {String} textareaid	
	 * @param {Integer} presel	example # to be initially selected (zero base)
	 */
	prepare: function(textareaid, presel){
		this.textarea = Util.dom.byid(textareaid);
		var tadiv = this.tadiv = this.textarea.parentNode;
		if(!this.exdefs) return null;
		var that = this,
		selector_labels = Util.homedef.example_selector_label,
		legacy_labelkey = "label" + (Util.langidx === 1 ? "_en": ""),	//backward compat. use mlabel for new examples
		sel = Util.dom.element("select", "", [["class", "example"]]);
		if(!selector_labels) selector_labels = ["― クエリ例 ―", "=== Query Examples ==="];
		add_option(selector_labels[Util.langidx], "");
		this.exdefs.forEach(function(ex, i){
			var prolog = "",
			label = ex.mlabel ? ex.mlabel[Util.langidx] : ex[legacy_labelkey];
			if(ex.ns) ex.ns.forEach(function(pfx){
				if(this.ns[pfx]) prolog += "PREFIX " + pfx + ": <" + this.ns[pfx] + ">\n";
			}, this);
			add_option(label, prolog + ex.query, i);
		}, this);
		sel.addEventListener("change", function(ev){Util.example.set(ev.target.selectedIndex);});
		//position query example selector
		if(this.spread_selector){
			if(document.body.clientWidth > this.spread_minw) set_spread(tadiv, true);
			window.addEventListener("resize", function(ev){
				if(document.body.clientWidth > that.spread_minw){
					if(!tadiv.classList.contains("spread")) set_spread(tadiv, true);
				}else{
					if(tadiv.classList.contains("spread")) set_spread(tadiv, false);
				}
			});
		}
		this.tadiv.appendChild(sel);
		if(typeof(presel) !== "undefined") this.set(presel + 1);
		
		function add_option(label, query, i){
			var opt = Util.dom.element("option");
			opt.appendChild(Util.dom.text(label));
			if(i === presel) opt.setAttribute("selected", "selected");
			sel.appendChild(opt);
			that.queries.push(query);
		}
		//spread example selector 2021-02-27
		function set_spread(tadiv, to_set){
			if(to_set){
				//as open list
				tadiv.classList.add("spread");
				sel.setAttribute("size", 15);
			}else{
				//as popupmenu
				tadiv.classList.remove("spread");
				sel.setAttribute("size", 1);
			}
		}
	},
	set: function(i){
		if(i===0) return;
		this.update_qtarea(this.queries[i]);
	},
	update_qtarea: function(qtext){
		this.textarea.value = qtext;
		if(CMEditor) CMEditor.setValue(qtext);
	}
};

//query rewriter. to be called from snorql
Util.queries = {
	current_q: null,
	replace_template: null,
	maxres: 1000,
	sd_templ: {},	//Snorqldef.qtemplate will be set by Util.init()
	item_svars: ["cho", "s", "uri"],	//var names to be regarded as item subject
	vars: [],
	/**
	 * generates a query link for a uri by replaceing current query, for aggregation query result.
	 * 集約型クエリ（変数にcountを含む）とき、集約キー変数の値URIリンクを、集約キー値検索クエリリンクに変換する。
	 * @param {String} uri	target uri
	 * @param {Boolean} as_literal	true if the aggregation key value is a literal, rather than uri
	 * @return {String}	query uri string
	 */
	replace_q: function(uri, as_literal){
		if(!this.current_q) this.current_q = Util.current_query || Util.example.textarea.value;
		if(this.replace_template === null) //replace_template will be re-used in this session
		try{
			var sqt,
			solabel = this.sd_templ.solabel || "?label",	//label var used in solution list
			condlabel = this.sd_templ.condlabel || "?label ; ";	//label part used in query condition
			//find key and count vars
			this.replace_template = this.current_q
				.replace(/\s*GROUP BY.*/i, " LIMIT " + this.maxres)
				.replace(/SELECT\s+(distinct )?\?(.+)\(count\(.*?\?(\w+)\) as \?count\)/i, "SELECT DISTINCT __$3 " + solabel);
			var vkey = RegExp.$2,
			vcount = RegExp.$3,
			v1 = vkey.split(' ');	//in case other vars found btw 1st var and count(var) 2020-06-18
			if(v1.length > 1) vkey = v1[0];
			//remove label query for the key var
			this.replace_template = this.replace_template
				.replace(new RegExp("\\s*\\?" + vkey + " +rdfs:label +\\?(\\w+) *;?"), "");
			var volabel = RegExp.$1 || null;
			//rewrite key var as acutual uri, and count var as subject
			this.replace_template = this.replace_template
				.replace(new RegExp("\\?" + vkey + "\\b", "g"), "%uri%")
				.replace(new RegExp("\\?" + vcount + "(\\s*[;\\.])", "g"), "__" + vcount + "$1")	//avoid adding rdfs:label to the obj var
				.replace(new RegExp("(\\?" + vcount + "\\b)"), "$1 rdfs:label " + condlabel)
				.replace(new RegExp("__" + vcount, "g"), "?" + vcount)
				.replace(new RegExp(";\\s*([;\\.])", "g"), "$1")
				.replace(new RegExp("\\.\\s*[;\\.]", "g"), ".")
				.replace(/\(sample\((.*?)\) as.*?\)/, "$1");	//in case include sample image in aggr query 2019-12-12
			//remove var for key var label if exists
			if(volabel) this.replace_template = this.replace_template
				.replace(new RegExp("(SELECT.+)\\?" + volabel + " (.*WHERE)"), "$1$2")
				.replace(new RegExp("FILTER[^\\?]+\\?" + volabel + "\\)?[^\\)]+\\)", "i"), "")
				.replace(new RegExp("\\s*FILTER not exists *{\\s*}", "i"), "");
			
			//additional options / filters
			//if key is ndc try to add special NDC-LD query option
			if(vkey === "ndc") this.replace_ndcq();
			//if the count variable is cho or s or uri, then add optional image query
			else if(this.item_svars.includes(vcount)) this.replace_imgq(vcount);
			//if the count var is "provider", then make it count query again with the provider as the key
			else if(vcount === "provider") this.replace_providerq(vcount, solabel, condlabel);
			if(as_literal){
				//in case aggregation key is a literal variable
				this.replace_template = this.replace_template
				//.replace(/\?label \?label/, "?label")
				.replace("?label ?label", "?label")
				.replace(/; ?rdfs:label \?label/, "")
				.replace(/FILTER ?\(?str(starts|ends)\(.*?\)\)?\s*\.?\n?/i, "\n");
			}
		}catch(e){
			console.log("query replace template failed", e);
			this.replace_template = false;
		}
		//in case template failed, simply return the uri
		else if(this.replace_template === false) return uri;
		var encl = as_literal ? ['"', '"'] : ["<", ">"],
		query = this.replace_template.replace(/%uri%/g, encl[0] + uri + encl[1]);
		return "?query=" + encodeURIComponent(query);
	},
	/**
	 * add optional image query clause to teh replace_template
	 * @param {String} vsubj	variable name to be used as a subject
	 */
	replace_imgq: function(vsubj){
		var im = this.replace_template.match(/schema:image\s(\?\w+)/),
		where_re = new RegExp("((FROM|WHERE\\s*{))", "i");
		if(im){
			//in case original query has image part
			//and not has ?image in select variables 2019-12-12
			if(! this.replace_template.match(new RegExp("SELECT .*\\" + im[1] + " .*WHERE\\s*{", "i")))
			this.replace_template = this.replace_template
			.replace(new RegExp("\\(sample\\(\\"+ im[1] + "\\) as .+?\\)\\s*"), "")
			.replace(where_re, im[1] + " $1");
		}else if(this.sd_templ.filter){
			this.replace_template = this.replace_template
			.replace(new RegExp("}\\s*LIMIT"), "\t" + this.sd_templ.filter + "\n} LIMIT");
		}else{
			//otherwise
			this.replace_template = this.replace_template
			.replace(where_re, "?image $1")
			.replace(new RegExp("}\\s*LIMIT"), "\tOPTIONAL {?" + vsubj + " schema:image ?image}\n} LIMIT");
		}
	},
	/**
	 * special treatment for provider query = meke it as a count query rather than description of the provider
	 * @param {String} vprvdr	var name of a provider
	 * @param {String} solabel	var names of labels in solution
	 * @param {String} condlabel	labels in query condition
	 */
	replace_providerq: function(vprvdr, solabel, condlabel){
		var svar;
		//test works only for JPS
		if(!this.replace_template.match(new RegExp("schema:provider\\s+\\?" +vprvdr))) return;
		else if(!(svar = this.replace_template.match(/\?(\w+) jps:sourceInfo/))) return;
		this.replace_template = this.replace_template
		.replace("SELECT DISTINCT ?" + vprvdr + " " + solabel, "SELECT ?" + vprvdr + " (count(?" + svar[1] + ") as ?count)")
		.replace(vprvdr + " rdfs:label " + condlabel, vprvdr)
		.replace("LIMIT " + this.maxres, "GROUP BY ?" + vprvdr + " ORDER BY desc(?count)")
	
	},
	/**
	 * add special NDC-LD query option if 1st var is ndc. only valid for JPS compatible endpoint
	 */
	replace_ndcq: function(){
		if(!Util.is_jpscompat) return;
		this.replace_template = this.replace_template
		.replace(/\?clabel/, "(sample(?creator) as ?creator) ?date")
		.replace(/\t*\?what \(skos:closeMatch\|skos:broaderMatch\).*?\n/, "")
		.replace(/\t*FILTER.*?ndc9#.*?\n/, "")
		.replace(/%uri% a .*ndcvocab.*?;\s+skos:broader.*?;\n/, "%uri%")
		.replace(/(OPTIONAL ?{ ?)?%uri%\s+rdfs:label \?clabel( ?\.? ?})?/, "OPTIONAL{?cho schema:creator/rdfs:label ?creator}\n\tOPTIONAL{?cho schema:datePublished ?date}")
		.replace(/LIMIT/, " ORDER BY desc(?date) LIMIT");
	},
	/**
	 * set image var td content. called from SPARQLResultFormatter._getLinkMaker.
	 * クエリ変数名が(thumb(nail)?|image)であるとき、結果表示セルを画像にし、主語記述リンク（descuri）を設定する。クエリ結果テーブルに他の値とともに画像が表示され、画像をクリックすると画像自身ではなくそのレコードの記述が表示されることになる（多くの場合、直感に反しない挙動）。画像のURIはツールチップとして表示される。
	 * @param {String} uri	URI of the image
	 * @param {String} descuri	describer URI for the subject item (set by SPARQLResultFormatter._uri_describer)
	 */
	image_q: function(uri, descuri){
		var img = Util.dom.element("img");
		uri = uri.replace(/(ogiNikki\/.*?)\/0001.jpg/, "$1/0004.jpg");
		img.src = uri;
		img.className = "thumb";
		img.alt = uri;	//URI is the actual value of the result sets. alt makes it possible for users to copy the value
		Util.img.on_event(img, {w:50});
		if(descuri){
			//if item uri (i.e. ?s, ?uri, ?cho) found in SPARQLResultFormatter._formatURI
			//make thumbnail click to load the description, rather than image itself
			var a = Util.dom.element("a");
			a.title = "link to the item description.\nimage = " + uri;
			a.href = descuri;
			a.appendChild(img);
			return a;
		}else{
			//no link, only shows the thumbnail. title attr for tooltip. also alt (see above) makes value copy possible
			img.title = uri;
			return img;
		}
	},
	/**
	 * expand literal aggregation key, e.g. {?s schema:description ?key filter strstarts(?key, "format")} group by ?key
	 * 集約型クエリでキー変数がリテラル値である時、ctrl+clickでreplace_qと同じ形の集約キー値検索クエリが使えるようにする。
	 * @param {DOMNode} elt	element to add pseudo link
	 * @param {String} val	value of the literal variable
	 */
	add_pseudo_qlink: function(elt, val){
		var q = this.replace_q(val, true);
		elt.addEventListener("click", function(ev){
			if(ev.getModifierState("Control")){
				location.href = q;
				ev.preventDefault();
				return false;
			}
		});
		elt.classList.add("pseudoquery");
		elt.title = "ctrl+click to expand query";
	},
	/**
	 * virtuoso specific preamble
	 * @param {String} query	query string in question
	 * @param {String} qtype	query type = DESCRIBE|SELECT
	 * @param {Boolean} is_virtuoso	true if the endpoint uses Virtuoso
	 */
	preamble: function(query, qtype, is_virtuoso){
		if(!is_virtuoso) return query;
		if(qtype === "DESCRIBE"){
			// query = "define sql:describe-mode \"CBD\"\n" + query;
		}else if(qtype === "SELECT" && query.match(/SELECT \?type \(count.*\)/i)){
			var exclude = "";
			["http://www.w3.org/2002/07/owl#",
			"http://www.w3.org/ns/ldp#",
			"http://www.openlinksw.com/schemas/virtrdf#"
			].forEach(function(uri){
				exclude += "define input:default-graph-exclude <" + uri + ">\n";
			});
			query = exclude + query;
		}
		return query;
	},
	//have fun!
	count_q: function(){
		var current_q = CMEditor.getValue();
		CMEditor.setValue(current_q.
			replace(/SELECT (DISTINCT )?(\?\w+) .*WHERE/i, "SELECT ?key (count($1$2) as ?count) WHERE").
			replace(/\?(cho|s) rdfs:label \?label/, "?$1 schema:creator ?key").
			replace(/\s*OPTIONAL.*\n/ig, "\n").
			replace(/}\s*(LIMIT \d+|$)/i, "} GROUP BY ?key ORDER BY desc(?count)")
		);
	},
	add_countq: function(){
		var trigger = Util.dom.element("span", "🕸", [["class","strigger"], ["title", "count query"]]);
		trigger.onclick = function(){Util.queries.count_q();};
		document.getElementById("querytext").parentNode.appendChild(trigger);
	}
};

///add map w/ Leaflet
Util.map = {
	mymaps: [],
	def: null,
	linkd: null,
	geohashp: null,
	init: function(){
		if(Util.ldb){
			this.def = Util.ldb.mapd ? Util.ldb.maps[Util.ldb.mapd] : {
				template:  ["https://{s}.tile.osm.org/{z}/{x}/{y}.png",	//ja
					"https://{s}.tile.osm.org/{z}/{x}/{y}.png"],	//en
				lp: "qparam",
				fillopc: 0.15,
				aerial: "https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg",
				attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
			};
			this.linkd = Util.ldb.mapd || "openstreetmap.org";
			this.geohashp = Util.ldb.geohash_pat;
		}
	},
	/**
	 * setup leaflet map. zoom level is determined by the length and value pattern of covering area geohash
	 * Leaflet地図の設定。ズームレベルをwithinhashの桁数およびパターンで決定する。geohashが与えられなければデフォルト値。
	 * @param {DOMNode} tgobj	element to append a map
	 * @param {Number} lat	latitude of the location
	 * @param {Object} po	RDF/JSON property-object of geo info to find longitude value
	 * @param {Object} ns	namespace pfx-url map object
	 * @param {String} rdftype	rdf:type of the described item
	 * @param {String} withinhash	geohash of the area that covers the location
	 * @param {String} selfhash	geohash of the location
	 */
	setup: function(tgobj, lat, po, ns, rdftype, withinhash, selfhash){
		//requires Leaflet
		if(!window.L) return false;
		if(!this.geohashp) this.geohashp = {
			home: new RegExp("^(w[uvz]|wy[h-z]|x[hjnpr]|z0[hj]|z2)"),	//japan
			dense: new RegExp("^xn7(6[c-u]|7[3-9a-j])"),	//tokyo
			sparse: new RegExp("^x(ps|xn)$")
		};
		var long,
		zlevel = 10,	//zoom level. final zlevel is determined by geohash if provided
		use_pointmarker = false,
		mapdiv = Util.dom.element("div"),
		precision = withinhash ? withinhash.length : 7,	//geohash length corresponds to precision (the shorter, the wider area)
		testhash = withinhash || selfhash || "",	//geohash to test against geohashp patterns
		in_homearea = testhash.match(this.geohashp.home) ? true : false;	//2021-01-27
		if(lat){
			long = this.getval(po, ns.schema + "longitude");
		}else{
			//if setup is triggerd via gerCoveredBy, lat value is null
			lat = po.lat[0].value;
			long = po.long[0].value;
			if(precision > 5) precision = 5;	//set the location precision lower than actual location precision (7)
		}
		//// precision and zlevel test, because OSM zoom level's step is different from geohash length step
		zlevel = precision > 4 ? precision + 4 : //zlevel for loc within xn75h (prec=5) is 9
		(precision === 4 ? 9 : 	//zlevel for loc within xn75 (prec=4) is also 9
			(precision === 3 ? 6 : 	//zlevel for loc within xn7 (prec=3) is 6	//same as: precision >= 3 ? precision + 3
				precision + 2)	//zlevel for loc within xn (prec=2) is 4
		);
		if(precision >= 6 && testhash.match(this.geohashp.dense)) zlevel += 2;
		else if(testhash.match(this.geohashp.sparse)) zlevel--;
		else if(!in_homearea){
			if(precision < 6) zlevel --;
			if(this.linkd === "maps.gsi.go.jp" && zlevel > 5){
				zlevel = 5;	//8
				use_pointmarker = true;
			}else{
				if(zlevel === 8) zlevel = 7;	//city level
			}
		}
		//use point marker for specific location
		if(zlevel > 6) use_pointmarker = true;
		//console.log(withinhash, zlevel, this.linkd, in_homearea);
		//setup map container elements and add to DOM tree
		tgobj.insertBefore(mapdiv, tgobj.firstChild);
		tgobj.classList.add("map");
		tgobj.previousSibling.classList.add("maplabel");
		
		////Leaflet map
		var mymap = L.map(mapdiv, {center: [lat, long], zoom: zlevel, zoomControl: false}),
		link = this.set_dlink(lat, long, zlevel),
		marker;
		L.tileLayer(this.def.template[Util.langidx], {
			attribution: this.def.attribution
		}).addTo(mymap);
		if(use_pointmarker) marker = L.marker([lat, long]);
		else{
			//if not use pointmarker (i.e. vague area), draw a circle around the area
			var rad = zlevel > 5 ? 1400000 : (zlevel > 3 ? 2600000 : 
				(zlevel > 1 ? (withinhash === "xn" ? 2800000 : 1800000) : 800000));
			marker = L.circle([lat, long], {stroke: false, fillColor: "blue", fillOpacity: this.def.fillopc, radius: rad / (zlevel*zlevel) });
			//console.log(precision, zlevel, rad, this.def);
		}
		marker.addEventListener("click", function(){location.href = link;});
		marker.addTo(mymap);
		this.mymaps.push(mymap);
	},
	//prepare map zoom link to destination
	set_dlink: function(lat, long, zlevel){
		var dlink = "https://" + this.linkd,
		zoom = (zlevel === 6) ? 8 : zlevel + 1;
		if(this.def.lp === "qparam"){
			dlink += "/?mlat=" + lat + "&mlon=" + long + "&zoom=" + zoom;
		}else{
			dlink += "/#" + zoom + "/" + lat + "/" + long;
		}
		return dlink;
	},
	//get one value of the object(s) of the property 
	getval: function(po, prop){
		var o = po[prop];
		return o ? o[0].value : null;
	},
	//need refresh for late appended map
	refresh: function(){
		if(this.mymaps.length) this.mymaps.forEach(function(m){m.invalidateSize();});
	},
	//calculates geohash boundary area (for future use)
	geohash_bounds: function (myhash) {
		const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
		var evenBit = true, 
		latMin =  -90, latMax =	 90,
		lonMin = -180, lonMax = 180;
		for(var i=0; i<myhash.length; i++) {
			var chr = myhash.charAt(i),
			idx = base32.indexOf(chr);
			if(idx === -1) throw new Error('Invalid geohash');
			for(var n=4; n>=0; n--) {
				var bitN = idx >> n & 1;
				if(evenBit) {
					var lonMid = (lonMin+lonMax) / 2;
					if(bitN === 1) lonMin = lonMid;
					else lonMax = lonMid;
				}else{
					var latMid = (latMin+latMax) / 2;
					if (bitN === 1) latMin = latMid;
					else latMax = latMid;
				}
				evenBit = !evenBit;
			}
		}
		var latc = (latMin + latMax)/2,
		lonc = (lonMin + lonMax)/2;
		latc = latc.toFixed(Math.floor(2-Math.log(latMax-latMin)/Math.LN10));
		lonc = lonc.toFixed(Math.floor(2-Math.log(lonMax-lonMin)/Math.LN10));
		return {bounds :[[latMin, lonMin], [latMax, lonMax]], center: [latc, lonc]};
	}
	
};
Util.img = {
	//replacement image on error (not found)
	on_event: function(imgelt, opt){
		var nfimg = this.gen_icon(opt.which, opt.w, opt.h || opt.w),
		https_proxy = Util.uri.https_proxy(true);
		//if(Snorqldef.img_extra) Snorqldef.img_extra(opt, imgelt.src);	//add extra option for image error handling
		imgelt.addEventListener("error", function(ev){
			if(this.getAttribute("data-org-src")){
				//if notfound image has a problem, throw an error to prevent loop
				throw new Error("replacement image " + nfimg + " not valid");
			}else if(!opt.recover || this.src === opt.recover){
				if(this.src.match(/^http:/) && https_proxy){
					this.src = https_proxy + this.src;
				}else{
					//if opt.recover is not provided, or recover image not found
					this.setAttribute("data-org-src", this.src);
					this.classList.add("still");
					this.title = "image not found";
					this.src = nfimg;
					this.setAttribute("alt", "*" + this.getAttribute("alt"));
				}
			}else if(this.src.match(/^http:/) && https_proxy){
				this.src = https_proxy + this.src;
			}else if(opt.recover){
				//if opt.recover is provided, try it first
				this.src = opt.recover;
			}else{
				console.error("under specified error option", opt);
			}
		});
		imgelt.addEventListener("load", function(ev){
			var fig = this.parentNode;
			if(this.naturalWidth > 200){ 
				if(!fig.classList.contains("still")){
					imgelt.addEventListener("click", function(evt){
						if(fig.classList.contains("zoomed")) fig.classList.remove("zoomed");
						else fig.classList.add("zoomed");
						evt.stopPropagation();
					});
					document.body.addEventListener("click", function(ev){
						if(fig.classList.contains("zoomed")) fig.classList.remove("zoomed");
					});
				}
			}else fig.classList.add("still");
		});
	},
	//brightness control 2021-02-16
	range_ctrl: function(img){
		var ctrl = Util.dom.element("div", "", [["title", "set brightness"],["class", "ctrl"]]),
		switcher = Util.dom.element("span", "☼"),	//☼◐
		slider = Util.dom.element("input", "", [
			["type", "range"],
			["min", 0],
			["max", 200],
			["value", 100],
			["style", "display: none"]
		]);
		ctrl.appendChild(switcher);
		ctrl.appendChild(slider);
		ctrl.addEventListener("click", function(evt){
			evt.stopPropagation();
		});
		switcher.addEventListener("click", function(evt){
			if(slider.style.display === "none"){
				slider.style.display = "inline";
				ctrl.classList.add("show");
			}else{
				slider.style.display = "none";
				ctrl.classList.remove("show");
			}
			evt.stopPropagation();
		});
		slider.addEventListener("change", function(evt) {
			img.style.filter = "brightness(" + evt.target.value + "%)";
		});
		return ctrl;
	},
	gen_icon: function(which, w, h, fcolor){
		var vb, pparam;
		if(!fcolor) fcolor = "#9999cc";
		if(which === "book"){
			vb = "-4 -2 52 50",
			pparam = {"fill-rule":"evenodd","clip-rule":"evenodd",fill:fcolor,d:"M41,46L41,46c0,0.553-0.447,1-1,1H12l0,0c-2.762,0-5-2.238-5-5V6c0-2.761,2.238-5,5-5l0,0h26l0,0c0.414,0,0.77,0.252,0.922,0.611C38.972,1.73,39,1.862,39,2v0v7l0,0h1l0,0c0.278,0,0.529,0.115,0.711,0.298C40.889,9.479,41,9.726,41,10c0,0,0,0,0,0V46z M9,42L9,42L9,42c0,1.657,1.344,3,3,3h3V11h-3l0,0c-1.131,0-2.162-0.39-3-1.022V42z M37,9V3H12l0,0l0,0c-1.656,0-3,1.343-3,3s1.344,3,3,3H37L37,9z M39,11H17v34h22V11z M12,7c-0.553,0-1-0.448-1-1s0.447-1,1-1h22c0.553,0,1,0.448,1,1s-0.447,1-1,1H12z"};
			if(!w){w = 128, h = 150;}
		}else{
			vb = "-1 0 25 25";
			pparam = {fill:fcolor,d:"M14 2H6C4.89 2 4 2.9 4 4V20C4 21.11 4.89 22 6 22H18C19.11 22 20 21.11 20 20V8L14 2M18 20H6V4H13V9H18V20M15 13C15 14.89 12.75 15.07 12.75 16.76H11.25C11.25 14.32 13.5 14.5 13.5 13C13.5 12.18 12.83 11.5 12 11.5S10.5 12.18 10.5 13H9C9 11.35 10.34 10 12 10S15 11.35 15 13M12.75 17.5V19H11.25V17.5H12.75Z"};
		}
		return this.gen_svgdata({viewBox:vb, width: w, height: h}, this.gen_elt("path", pparam));
	},
	gen_svgdata: function(atr, cont){
		atr.xmlns = "http://www.w3.org/2000/svg";
		return "data:image/svg+xml," + encodeURIComponent(this.gen_elt("svg", atr, cont));
	},
	gen_elt: function(elt, atr, content){
		var tag = "<" + elt;
		if(atr) for(var key in atr) tag += " " + key + "='" + atr[key] + "'";
		return tag + (content ? ">" + content + "</" + elt : "/") + ">";
	}
};
Util.iiif = {
	logo: null,
	viewer: "",
	set_viewer_link: function(manifest, canvas, indv){
		 return this.viewer + manifest + (canvas ? "&canvas=" + canvas : "") + (indv ? "&vhint=individuals" : "");
	},
	ld: {p:[["b","M 65.2422,2178.75 775.242,1915 773.992,15 65.2422,276.25 v 1902.5"],["b","m 804.145,2640.09 c 81.441,-240.91 -26.473,-436.2 -241.04,-436.2 -214.558,0 -454.511,195.29 -535.9527,436.2 -81.4335,240.89 26.4805,436.18 241.0387,436.18 214.567,0 454.512,-195.29 535.954,-436.18"],["r","M 1678.58,2178.75 968.578,1915 969.828,15 1678.58,276.25 v 1902.5"],["r","m 935.082,2640.09 c -81.437,-240.91 26.477,-436.2 241.038,-436.2 214.56,0 454.51,195.29 535.96,436.2 81.43,240.89 -26.48,436.18 -241.04,436.18 -214.57,0 -454.52,-195.29 -535.958,-436.18"],["b","m 1860.24,2178.75 710,-263.75 -1.25,-1900 -708.75,261.25 v 1902.5"],["b","m 2603.74,2640.09 c 81.45,-240.91 -26.47,-436.2 -241.03,-436.2 -214.58,0 -454.52,195.29 -535.96,436.2 -81.44,240.89 26.48,436.18 241.03,436.18 214.57,0 454.51,-195.29 535.96,-436.18"],["r","m 3700.24,3310 v -652.5 c 0,0 -230,90 -257.5,-142.5 -2.5,-247.5 0,-336.25 0,-336.25 l 257.5,83.75 V 1690 l -258.61,-92.5 V 262.5 L 2735.24,0 v 2360 c 0,0 -15,850 965,950"]],vb:"0 0 493.35999 441.33334",tm:"matrix(1.3333333,0,0,-1.3333333,0,441.33333) scale(0.1)",c:{"b":"2873ab","r":"ed1d33"}},gen: function(h){var elt=Util.dom.sve("svg",[["viewBox",this.ld.vb],["height",h]]),g=Util.dom.sve("g",[["transform",this.ld.tm]]);this.ld.p.forEach(function(pa){g.appendChild(Util.dom.sve("path",[["d",pa[1]],["style","fill:#"+this.ld.c[pa[0]]]]));},this);elt.appendChild(g);return elt;}
};

Util.waka = {
	wbox: null,
	show: function(obj, div, wtype){
		var body = obj.rdfjson[obj.uris.tgrsrc],
		sinfo =  obj.rdfjson[obj.uris.tgrsrc + "#sourceinfo"],
		provider = sinfo ?  Util.uri.split(sinfo[obj.ns.schema + "provider"][0].value, true) : null,
		wo;
		switch(provider){
		case "二十一代集データベース":
			wo = this.get_d21(body, obj.ns);
			break;
		case "万葉集データベース":
			wo = this.get_manyo(body, obj.ns);
			break;
		default:
			wo = this.get_general(body, obj.ns);
		}
		var kami = wo.vparts.splice(0,3).join(" "),
		shimo = [],
		nparts = wo.vparts.length;
		for(var i=0; i<nparts; i += 2) shimo.push(wo.vparts.slice(i, i+2).join(" "));
		var wbox = Util.dom.element("div"),
		wocbar = this.wocbar.set(wbox),
		nav = this.set_prev_next(obj.uris.tgrsrc, wo.zeros),
		vbox = Util.dom.element("span");
		vbox.className = "verse";
		wbox.appendChild(wocbar);
		this.wbox = wbox;
		nav.forEach(function(elt){wbox.appendChild(elt)});

		//initial close if verse is too long;
		if(nparts > 10 || wo.vlen > 64 || document.body.clientWidth < 700) this.wocbar.toggle(wocbar, true);
		if(wo.kotoba) this.add_box(wbox, wo.kotoba, "kotoba");
		else if(wtype === "俳句") this.add_box(wbox, "　", "kotoba");
		if(wo.author) this.add_box(wbox, wo.author, "author");
		this.add_box(vbox, kami, "kami");
		shimo.forEach(function(simo){this.add_box(vbox, simo, "shimo")}, this);
		wbox.appendChild(vbox);
		wbox.classList.add("waka");
		div.insertBefore(wbox, div.firstChild);
	},
	//Waka open/close bar
	wocbar: {
		closer: {char: "▲", msg: "close waka box"},
		opener: {char: "▼", msg: "open waka box"},
		set: function(wbox){
			var wbar = Util.dom.element("div", this.closer.char);
			wbar.className = "wbar";
			wbar.title = this.closer.msg;
			wbar.addEventListener("click", function(){
				Util.waka.wocbar.toggle(this);
			});
			return wbar;
		},
		toggle: function(obj, to_close){
			//console.log(obj.innerText, to_close);
			if(obj.innerText === this.closer.char || to_close){
				Util.waka.wbox.classList.add("hide");
				obj.innerText = this.opener.char;
				obj.title = this.opener.msg;
			}else{
				Util.waka.wbox.classList.remove("hide");
				obj.innerText = this.closer.char;
				obj.title = this.closer.msg;
			}
		}
	},
	get_d21: function(body, ns){
		var verse = body[ns.rdfs + "label"][0].value || null,
		desc = body[ns.schema + "description"] || null,
		kotoba,
		author;
		if(!verse || !desc) return false;
		desc.forEach(function(d){
			if(d.value.match(/^［和歌作者原表記］(.*)/)){
				author = RegExp.$1;
			}else if(d.value.match(/^［詞書原表記］(.*)/)){
				kotoba = RegExp.$1.replace(/＋＋/g, "〳〵");
			}
		});
		return {
			"vparts": verse.replace(/＋＋/g, "〳〵").split("／"),
			"kotoba": kotoba,
			"author": author,
			"zeros": "0000000000",
			"vlen": verse.length
		};
	},
	get_manyo: function(body, ns){
		var names = body[ns.schema + "name"] || null,
		desc = body[ns.schema + "description"] || null,
		author = body[ns.schema + "creator"] || null,
		verse,
		kotoba;
		if(!names || !desc) return false;
		names.forEach(function(n){
			if(n.lang === "ja-kana") verse = n.value;
		});
		desc.forEach(function(d){
			if(d.value.match(/^題詞: (.*)/)) kotoba = RegExp.$1;
			if(!verse && d.value.match(/^詞書: (.*)/)) verse = RegExp.$1.replace(/（.*?）/g, "");
		});
		if(!verse) verse = names[0].value;
		return {
			"vparts": verse.split(" "),
			"kotoba": kotoba,
			"author": author ? author[0].value.replace(/^.*name\//, "") : null,
			"zeros": "0000",
			"vlen": verse.length
		};
	},
	get_general: function(body, ns){
		var verse = body[ns.rdfs + "label"][0].value || null,
		desc = body[ns.schema + "description"] || null,
		creator = body[ns.schema + "creator"] || null,
		kotoba, author;
		if(desc) desc.forEach(function(d){
			if(d.value.match(/^(本位句)?(題詞|詞書|前書)[:：] ?(.*)/)) kotoba = RegExp.$3;
			if(d.value.match(/^(本位句)?(俳号)[:：] ?(.*)/)) author = RegExp.$3;
		});
		if(!author && creator) author = "［" + creator[0].value.replace(/^.+\/(ch|nc)name./, "") + "］";
		return {
			"vparts": verse.split(/[ 　／]/),
			"kotoba": kotoba,
			"author": author ,
			"zeros": "0000",
			"vlen": verse.length
		};
	},
	set_prev_next: function(uri, zeros){
		var pn_uri = this.get_serial_prev_next(uri, zeros, [0, 34346]),
		prev_next = [];
		[{"class": "prev", "char": "▶"}, {"class": "next", "char": "◀"}].forEach(function(obj, i){
			var ref = pn_uri[i].uri, elt;
			if(ref){
				elt = Util.dom.element("a", obj.char);
				elt.setAttribute("href", ref);
				elt.title = obj.class + ": " + pn_uri[i].label;
			}else{
				elt = Util.dom.element("span");
			}
			elt.className = "nav " + obj.class;
			prev_next.push(elt);
		});
		return prev_next;
	},
	get_serial_prev_next: function(uri, zeros, minmax){
		var m = uri.match(/^(.*[^\d])(\d+)(S\d?)?$/),
		next_id = Number(m[2]) + 1,
		prev_id = Number(m[2]) - 1;
		return [{
			"uri": prev_id < minmax[0] ? null : "?describe=" + m[1] + Util.numformat(prev_id, zeros),
			"label": prev_id
		}, {
			"uri": next_id > minmax[1] ? null : "?describe=" + m[1] + Util.numformat(next_id, zeros),
			"label": next_id
		}];
	},
	add_box: function(wbox, str, cls){
		var box = Util.dom.element("span", str.replace(/[〔〕＊]/g, ""));
		box.className = cls;
		wbox.appendChild(box);
	}
};

//for IE
if(!Array.prototype.hasOwnProperty("includes")){
	Array.prototype.includes = function(tgelt){
		return (this.indexOf(tgelt) === -1) ? false: true;
	}
}
if(!Element.prototype.hasOwnProperty("closest")){
	Element.prototype.closest = function(tgelt){
		var myelt = this.parentElement;
		do{
			if((myelt.tagName === tgelt)) return myelt;
		}while((myelt = myelt.parentElement));
		return null;
	}
}