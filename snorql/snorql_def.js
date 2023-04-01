//snorql.js / snorql_ldb.js custom configuration for Japan Search
//@version 2020-09-23, 2021-02-01 desc_uripats, 2021-02-28 label_union追加
var Snorqldef = {
	//@@overrides Snorql class variables
	//snorqlの基本設定を上書きするための変数定義
	vars: {
		//snorqlで使用するエンドポイントURI: the endpoint URI used by snorql.if not set, default ep is s/snorql/sparql/ of current.
		_endpoint: "https://dydra.com/ut-digital-archives/oi/sparql",
		//URL to be set on #powerdby <a> element of HTML. Also used for home.uri unless explicitly specified
		_poweredByLink: "",
		//anchor text for the above element. Also used for home.label unless explicitly specified
		_poweredByLabel: "教育メタデータ",
		//ids of HTML elements, if use other than default ones
		//ids: {pwrdby: "poweredby"},
		
		//default query to be set on text area when loaded without user query ユーザクエリ無しでロードされた時にtextareaに表示
		default_query: "SELECT DISTINCT * WHERE {\n\t?s ?v ?o\n}\nLIMIT 100",
		
		//relative path to store small icons, incl link_img. default = ""
		//relpath: "./images/",
		//use_browsecp: true,	//true if want to use snorql original browse=classes etc query
		
		//prefixes to display properties as QName (in addtion to basic snorql._namespace) used by SPARQLResultFormatter._formatURI
		//_namespace設定以外に表示時にQNameとする接頭辞:名前空間URIマッピング
		more_ns: {
			"ind": "https://jpsearch.go.jp/entity/ind/",
			"dc": "http://purl.org/dc/elements/1.1/",
			"dct": "http://purl.org/dc/terms/",
			"foaf": "http://xmlns.com/foaf/0.1/",
			"dcndl": "http://ndl.go.jp/dcndl/terms/",
			"skosxl": "http://www.w3.org/2008/05/skos-xl#",
			"rda": "http://RDVocab.info/ElementsGr2/",
			"ndcv": "http://jla.or.jp/vocab/ndcvocab#",
			"cc": "http://creativecommons.org/ns#"
		}
	},
	
	//@@home setting properties (used in snorql.init_homedef).
	//snoqlのinit_homedefで使用する基本設定。home全体を割愛することは可能。
	home: {
		//////@@required properties if define home object. homeを持つ場合は必須のプロパティ。
		//the type of SPARQL endpoint, specially used to add preamble to query string (Util.query.preamble)
		endpoint_type: "virtuoso", // virtuoso|any
		//label appended to "Snorql for" in <head>. if not set, _poweredByLabel is reused, if false simply "Snorql"
    	//label: false, 	//"Japan Search",
		//base uri for resources in the endpoint. Used as uris.home in snorql_ldb. if not set, _poweredByLink is reused
		//uri: "https://jpsearch.go.jp/",
		
		//basic 'record' namespace. used to compact title elt, to find related items by appending other item ids
		//エンドポイント基本データURI。短縮title要素生成や続くID部分を置き換えて関連リソースを検索するなどのために用いる。
		datauri: "https://jpsearch.go.jp/data/",
		//basic 'record' URI pattern to decide is_home_uri, which is, if true, a signal to fetch resource labels and more info
		//snorqlおよび_ldbのis_home_uriを範囲するためのエンドポイント基本データURIパターン。trueならラベルや他情報を追加取得する
		datauri_pat: "^(https://jpsearch.go.jp|https://ld.cultural.jp|http://purl.org/net/ld/jpsearch)/data/",	//basic 'record' namespace pattern
		
		//if describe query should add frag ids to the main resource. Used in snorql.sub_resource_query
		//is_home_uriと判定された時、リクエストされたURIに加えてサブリソースを同時にdescribeするためのフラグメント識別子
		data_frags: ["accessinfo", "sourceinfo"],
		//or if describe query should add ids that is a variation of the main resource uri
		//同時にdescribeするサブリソースURIがフラグメントではなく本URIの一部を置き換える場合のパターン
		//datauri_replace: [{from: "ndlna", to: "entity"}],
		desc_uripats: ["https://jpsearch.go.jp/(entity|data)", "https://ld.cultural.jp/data/"],	//always use describe link even if dlink prop
		//additional 'record' namespaces to decide is_home_uri, which is not used subresource query
		//is_home_uriを判定する追加名前空間URI。サブリソースの追加describeには用いない。
		workuri: ["https://jpsearch.go.jp/entity/", "https://jpsearch.go.jp/term/keyword/"],	//additional 'record' namespaces
		//images to use notifier, indicator etc. those bundled with standard snorql_ldb set
		img: {
			"link": "link.png",	//external link. default is defined in snorql.js as "link.png"
			"spinner": "spinner.gif",	//progressing indicator
			"spinner-light": "transp-spinner-light.gif",	//progressing indicator on light background
			"wikipedia": "wpfav.png",	//wikipedia link
			"washi": "washi.jpg",	//Japanse paper style background (used in CSS)
			"rdf": "rdf_flyer.24.gif"	//RDF symbol
		},
		//通常プロパティ名にはリンクを設定しないが、trueにすると値と同じくdescribeリンクを設定できる
		//prop_describe_link: true,	//set true to add a describe link to prop name. usually no link
		
		//example_selector_nospread: true,	//true if example selector to be always a popup, not a spreaded list
		
		//////@@ optional multi language label setting. 言語に応じてラベルを切り替えるためのオプション設定
		//default_lang: "ja",	//language to select 'default' label for bellow multi lang array
		
		//each label bellow is [default, other] language string array. 'default' (element 0) is used when default_lang and the browser pref lang setting is the same. otherwise, 'other' (element 1) is used
		//以下の多言語ラベル配列は[default, other]で、default_langとブラウザ設定が一致すればdefault（第1要素）、でなければother（第2要素）が用いられる。
		
		//replace Snorql submit button label. Snorqlのsubmitボタンを言語に応じて切り替えるための設定
		submit_selector: "#qsection input[type=button]",	//query selector for the button to replace label
		submit_label: ["クエリ実行", "Run Query"],	//display label for the submit button [ja, en]
		
		//@ used in Util.intro via snorql.prepare_default
		//ユーザクエリなしの初期状態で表示するイントロセクションで用いる表示設定。
		//basic intro template, if built-in snorql_ldb intro is not appropriate. 組み込み基本紹介では不適当な場合に用いる
		//%s0%, %s1%, %s2% are replaced with intro_bendp, link to original Snorql, link to direct endpoint respectively
		//intro_tmpl: ["%s0%は%s1%の拡張ツールです。アプリケーションは%s2%をどうぞ。", "%s0% is an extension</a> of %s1%. Use %s2% for application."],
		//replacement multilang array for %s0% if not use built-in
		//intro_bendp: ["基本エンドポイント", "basic endpoint"],
		//<ul> list items to provide additional information. set null or just delete if no <ul> list is needed
		//基本紹介に続けて表示する<ul>用の多言語ラベル配列の配列。不要ならnullとする。※当初は第1アイテムは組み込みにしていましたが、より柔軟な設定ができるよう、リストすべてをここでの定義に移しました。
		intro: [
			["「学習指導要領LODとの統合クエリ」などにおいて、<a href=\"https://jp-cos.github.io/\">学習指導要領LOD</a>の成果を使用しています。"]
			// ["入力欄下もしくは右にクエリ例があります。<a href=\"https://jpsearch.go.jp/api/sparql-explain/\">ジャパンサーチSPARQLエンドポイント解説</a>も参照してください。", "Query examples are provided below (or right-hand side of) the text area. See also <a href=\"https://www.kanzaki.com/works/ld/jpsearch/primer/\">Japan Search RDF Model Primer</a> for the general description."],
			// ["エンドポイントの利用方法は<a href=\"https://jpsearch.go.jp/api/sparql-explain/\">SPARQLエンドポイント解説</a>をご覧ください。", "See <a href=\"https://www.kanzaki.com/works/ld/jpsearch/primer/\">Japan Search RDF Model Primer</a> for the general description of this endpoint."],
			// ["用いているRDFモデルの概要は<a href=\"https://jpsearch.go.jp/api/introduction/\">利活用スキーマ概説</a>をご覧ください。", "See <a href=\"https://jpsearch.go.jp/api/introduction/\">Introduction to Japan Search SPARQL Endpoint</a> (in Japanese) for the RDF model."],
			// ["Snorql for Japan Searchの概要は<a href=\"https://www.kanzaki.com/works/ld/jpsearch/snorql_ldb-about\">Snorql for Japan Seachを使う</a>をご覧ください。", "<a href=\"https://www.kanzaki.com/works/ld/jpsearch/snorql_ldb-about\">About Snorql for Japan Search</a> has basic explanation of this Snorql extension."]
		]
	},
	
	//@@snorql_ldb configuration
	//snorql_ldbで用いる設定
	ldb: {
		//try to fetch labels even if not is_home_uri = addex.labels()
		fetch_label: true,	//false if no label needed. "+prop" if propety names also need labels
		//function to extend scope in label query. default is UNION one nested nodes
		label_union: function(uri, apbase){
			return "UNION {<" + uri +"> ?p [<" + apbase.ns.jps + "relationType> ?s]} " + 
			"UNION {<" + uri +"#accessinfo> ?q ?s } " + 
			"UNION {<" + uri +"#sourceinfo> ?q ?s } "
		},
		//additional condition for label query: label of item with a category
		label_more_cond: function(uri, apbase){
			if(!apbase.app.category) return "";
			var props = [
				"http://purl.org/dc/terms/source",
				apbase.ns.schema + "subjectOf",	//e.g. as subject of ref book in Basho
				apbase.ns.schema + "translator"
			];
			return "UNION {<" + uri +"> ?p [(<" + props.join(">|<") + ">) ?s]} ";
		},
		//label_lang_filter: "FILTER(lang(?o)='')",	//to filter out multi results in label query
		
		//properties set for this.props object in JsonRDFFormatter
		label_prop: "rdfs:label",
		img_prop: "schema:associatedMedia",
		thumb_prop: "schema:image",	//maybe we should use schema:thumbnail
		//properties set for this.geo.prop object in JsonRDFFormatter
		geo: {
			prop: "schema:geo",
			strctprop : "jps:spatial",
			regionprop : "jps:region",
			valprop : "jps:value",
			locprop : "schema:location"
		},
		//preferred order of properties for described item. used in JsonRDFFormatter.
		//describeアイテムでのプロパティ表示順の設定
		proporder: {
			//the latter the heigher priority (top)
			//優先順位の「低い」順に指定するプロパティ定義配列
			showup: [
				"jps:within",
				"schema:longitude",
				"schema:latitude",
				"schema:geo",
				"jps:value",
				"jps:relationType",
				"schema:datePublished",
				"schema:dateCreated",
				"schema:temporal",
				"schema:spatial",
				"schema:productionCompany",
				"schema:publisher",
				"schema:contributor",
				"schema:actor",
				"schema:musicBy",
				"schema:creator",
				"schema:alternateName",
				"schema:name",
				"dct:title",
				"skosxl:altLabel",
				"skosxl:prefLabel",
				"rdfs:label",
				"rdf:type"
			],
			//the latter the lower priority (bottom)
			//最後に持ってくるプロパティ定義配列。表示はこの順序
			showdown: [
				"jps:accessInfo",
				"jps:sourceInfo"
			]
		},
		//propety based class attribute for tbody element (property group). used in JsonRDFFormatter
		//プロパティに応じてtbody要素（プロパティのグループ）に設定するclass属性の定義。背景色など
		propclass: {
			"rdf:type" : "type",
			"schema:productionCompany" : "agential",
			"schema:publisher" : "agential",
			"schema:contributor" : "agential",
			"schema:actor" : "agential",
			"schema:musicBy" : "agential",
			"schema:creator" : "agential",
			"jps:agential" : "agential",
			"schema:datePublished" : "temporal",
			"schema:dateCreated" : "temporal",
			"schema:temporal" : "temporal",
			"jps:temporal" : "temporal",
			"schema:spatial" : "spatial",
			"jps:spatial" : "spatial"
		},
		//display in sub table properties (fetch value uri and append sub table to the value td) if prop value matches the pat.
		//%home% will be replaced with home.uri i.e. current endpoint base
		//プロパティ値のURIから更にデータをエンドポイントから取得し、サブテーブルとして挿入するプロパティとURIパターン
		dist_props: {
			"schema:exampleOfWork" : "^%home%entity/",	//any home entity
			"schema:about": "^%home%entity/ind/",	//pattern for about is more restrictive
			//"schema:isPartOf",	//nested isPartOf is problematic...
		},
		//properties that set direct link rather than describe link
		//値URIを直接のリンクとして設定するプロパティ（通常はdescribe=URIリンクを設定する）
		dlink_props: [
			"schema:url",
			"schema:relatedLink",
			"schema:image",
			"schema:associatedMedia",
			"schema:thumbnail",
			"schema:sameAs",
			"jps:sourceData",
			"rdfs:seeAlso"
		],
		//properties that add type info for its value resource
		//追加情報としてプロパティ値リソースのタイプも取得するプロパティ
		type_info_props: [
			"schema:url",
			"schema:associatedMedia"
		],
		
		//suffix mapping for external links. used in JsonRDFFormatter
		//特定のURIパターンについて、リンクに接尾辞を加える定義
		link_sfx: [{ns: "http://geohash.org/", sfx: "?format=osm"}],	//sfx: "?format=text"
		//default open rows for multiple values (e.g. schema:description)
		//describeの結果表示で、同プロパティの値が多数ある時のデフォルト最大表示数（折りたたみ）
		showrows: 6,
		
		//@@ maps / IIIF related
		use_iiif_viewer: true,	//if want to use specific viewer, the name of viewer instead of true
		//iiif_manifest_param: "param",	//set if request param for manifest is not "manifest"
		//leaflet template information. used in Util.map.setup Leafletでの地図表示に用いるテンプレート
		mapd: "maps.gsi.go.jp", //★setting for JPS
		maps: {
			"openstreetmap.org": {
				template: ["https://{s}.tile.osm.org/{z}/{x}/{y}.png",	//ja
					"https://{s}.tile.osm.org/{z}/{x}/{y}.png"],	//en
				aerial: "https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg",
				lp: "qparam",
				fillopc: 0.15,
				attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
			},
			"maps.gsi.go.jp": {
				template: ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",	//ja
					"https://cyberjapandata.gsi.go.jp/xyz/english/{z}/{x}/{y}.png"],	//en
				aerial: "https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg",
				lp: "hash",
				fillopc: 0.28,
				attribution: '<a href="http://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html">国土地理院</a>'
			},
			"pale.maps.gsi.go.jp": {
				template: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
					"https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
				aerial: "https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg",
				lp: "hash",
				fillopc: 0.15,
				attribution: '<a href="http://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html">国土地理院</a>'
			}
		},
		//geohash pattern to determine map zoom
		geohash_pat: {
			home: new RegExp("^(w[uvz]|wy[h-z]|x[hjnpr]|z0[hj]|z2)"),	//japan
			dense: new RegExp("^xn7(6[c-u]|7[3-9a-j])"),	//tokyo
			sparse: new RegExp("^x(ps|xn)$")	//northern
		},
		//have fun!
		texternal: [87,87,87,14,75,65,78,90,65,75,73,14,67,79,77,15, 87,79,82,75,83,15,18,16,16,25,15,80,85,66,15]
	},
	
	//specify {endpoint: new RegExp(uri_pattern)} to link certain uris to different endpoint
	//特定のURIには別のエンドポイント（describe=uri処理ツール）を割り当てる設定
	describer_map: null,
	
	//label replace template used in Util.queries.replace_q for aggregate query results
	//集約クエリ結果のリンクを集約キーによる検索に置き換えるときに用いるラベルテンプレート（組み込みを置き換える場合）
	//qtemplate: {solslabel: subject-object-label-templ, condlabel: optional-label-template, filter: query-filter-template}
	
	//extended mapping for AskExternal. entrely optional
	askex: {
		//each key is a uri pattern of target LOD, and value is function to process a uri.
		pat2proc: {
			"https://khirin-ld.rekihaku.ac.jp/rdf/nmjh_kanzousiryou/[A-H]-[\\d\\-]+$": function(aex){
				aex.distill_and_proc("Khirin-ld", ["iscrr"], true);
				//aex.tguri += ".n3";
				//aex.getnt_and_proc("Khirin-ld", ["iscrr"], true);
				return true;
			}
		},
		//additionally, extra nspfx mapping can be added
		exns: {
			"iscrr": "http://khirin-ld.rekihaku.ac.jp/ns/iscrr/"	//Integrated Studies of Cultural and Research Resources
		}
	}

	//example_ns moved to just above Snorqldef.example
	//クエリ例定義およびクエリ例用追加名前空間設定は末尾参照
};

//property description for tool tips
Snorqldef.prop_description = {
	//key = property quname, value = multlang label array
	"schema:image": ["アイテムの代表画像。主としてサムネイル。", "Item's representative image, namely a thumbnail."],
	//for nested structure, parent propety qname + "_g" sets the scope to use description
	"jps:accessInfo_g": {
		//so, this description of "schema:provider" is used only when nested within "jps:accessInfo" value.
		"schema:provider": ["アイテムの所蔵者、あるいはアイテムへのアクセスの提供者。", "The holder of, or access provider to the item."],
		"schema:associatedMedia": ["アイテムのデジタル化オブジェクト。主として画像。", "Item's digitized object, namely an image."],
		"schema:url": ["アイテムの紹介やアクセス情報が記載されたページ、もしくはファイル。", "Web page of the access or contents information, or related file."],
		"schema:relatedLink": ["コンテンツ一覧ページなど、コンテンツがその一部として取り上げられているページ。", "Link to resource(s) where the item is listed as a part of contents."]
	},
	"jps:sourceInfo_g": {
		"schema:provider": ["アイテムの元メタデータの提供者、もしくはデータベース。", "The provider of source metadata of the item."],
		"schema:url": ["ソース（元メタデータ）提供者のアイテム情報ページ。", "The item page of the source metadata provider."],
		"schema:relatedLink": ["Japan Searchのアイテムページ。", "The item page of Japan Search"]
	}
};


////Snorqldef.example_ns, Snorqldef.example are moved to separate snorql_example.js
