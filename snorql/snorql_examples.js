/// /// Query examples クエリ例ポップアップ生成

// additional namespaces (not defined in namespaces.js) to use in examples as ns[] array which adds PREFIX clause
// クエリ例でns[]配列に指定することで追加のPREFIX句を加える
Snorqldef.example_ns = {
	"edm": "http://www.europeana.eu/schemas/edm/",
	"ore": "http://www.openarchives.org/ore/terms/",
	"wdt": "http://www.wikidata.org/prop/direct/",
	"crm": "http://www.cidoc-crm.org/cidoc-crm/",
	"pds": "http://purl.org/net/ns/policy#",
	"dct": "http://purl.org/dc/terms/",
	"dc": "http://purl.org/dc/elements/1.1/"
};

// list of example queries. each object represents one example: {label: Japanese label for select option, label_oth: English label for select option, ns: [prefixes to use in query], query: SPARQL query (escaped)}
// クエリ例を定義するオブジェクト
Snorqldef.example = [
	/*
	{
		"mlabel": ["test", "test"],
		"query" : 
`SELECT DISTINCT * WHERE {
	?s ?v ?o
}
LIMIT 100
`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	*/
	{
		"mlabel": ["学習指導要領LODとの統合クエリ", "test"],
		"query": 
`select ?s ?cos ?desc where {
	?s <https://w3id.org/sukilam-educational-metadata/term/property#指導要領コード> ?cos . 
	SERVICE SILENT <https://dydra.com/ut-digital-archives/jp-cos/sparql> {
		?cos schema:description ?desc . 
	}
}`,
		"ns" : [ ]
	},
	
	{
		"mlabel": ["教材一覧", "test"],
		"query" : 
`select * where {
	?s a <https://w3id.org/sukilam-educational-metadata/data/教育メタデータ>
}`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["画像を含む人物一覧", "test"],
		"query" : 
`select * where {
	?s a type:Agent;
		rdfs:label ?label;
		schema:image ?image
}`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["キーワード「富士山」を含む教育メタデータ", "test"],
		"query" : 
`SELECT DISTINCT ?s ?label ?p ?p2 ?keyword WHERE {
    bind(<https://w3id.org/sukilam-educational-metadata/キーワード/富士山> as ?keyword)
	{?s ?p ?keyword  FILTER(isIRI(?s))} UNION
	{?s ?p ?o . ?o ?p2 ?keyword FILTER(isBLANK(?o))
		MINUS {?s ?p3 ?keyword}
	}
	OPTIONAL {?s rdfs:label ?label}
} LIMIT 500`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["キーワード「防災」を含む教育メタデータ", "test"],
		"query" : 
`SELECT DISTINCT ?s ?label ?p ?p2 ?keyword WHERE {
    bind(<https://w3id.org/sukilam-educational-metadata/キーワード/防災> as ?keyword)
	{?s ?p ?keyword  FILTER(isIRI(?s))} UNION
	{?s ?p ?o . ?o ?p2 ?keyword FILTER(isBLANK(?o))
		MINUS {?s ?p3 ?keyword}
	}
	OPTIONAL {?s rdfs:label ?label}
} LIMIT 500`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["キーワード「徳川家康」を含む教育メタデータ", "test"],
		"query" : 
`SELECT DISTINCT ?s ?label ?p ?p2 ?keyword WHERE {
    bind(<https://w3id.org/sukilam-educational-metadata/キーワード/徳川家康> as ?keyword)
	{?s ?p ?keyword  FILTER(isIRI(?s))} UNION
	{?s ?p ?o . ?o ?p2 ?keyword FILTER(isBLANK(?o))
		MINUS {?s ?p3 ?keyword}
	}
	OPTIONAL {?s rdfs:label ?label}
} LIMIT 500`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["キーワード「第二次世界大戦」を含む教育メタデータ", "test"],
		"query" : 
`SELECT DISTINCT ?s ?label ?p ?p2 ?keyword WHERE {
    bind(<https://w3id.org/sukilam-educational-metadata/キーワード/第二次世界大戦> as ?keyword)
	{?s ?p ?keyword  FILTER(isIRI(?s))} UNION
	{?s ?p ?o . ?o ?p2 ?keyword FILTER(isBLANK(?o))
		MINUS {?s ?p3 ?keyword}
	}
	OPTIONAL {?s rdfs:label ?label}
} LIMIT 500`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["元資料の一覧", "test"],
		"query" : 
`select * where {
	?s a  <https://w3id.org/sukilam-educational-metadata/元資料>;
    	rdfs:label ?label;
       schema:image ?image;
	   schema:url ?url
}`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["小学６年生を対象にした教育メタデータ", "test"],
		"query" : 
`SELECT DISTINCT ?s ?label WHERE {
	?s semp:学年 <https://w3id.org/sukilam-educational-metadata/学年/小6>;
       rdfs:label ?label . 
}
LIMIT 100`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["東京都に関連する教育メタデータ", "test"],
		"query" : 
`SELECT DISTINCT ?s ?label WHERE {
	?s semp:地理情報_都道府県 <https://w3id.org/sukilam-educational-metadata/地理情報_都道府県/東京>;
       rdfs:label ?label . 
}
LIMIT 100`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["ジャパンサーチの資料を使った教育メタデータ", "test"],
		"query" : 
`select distinct ?e ?label ?src ?src_label ?url ?image where {
	?top semp:元資料メタデータ/semp:元資料 ?src . 
	?src a  <https://w3id.org/sukilam-educational-metadata/元資料>;
		  rdfs:label ?src_label;
		  schema:image ?image;
		  schema:url ?url . 
		  filter (regex(str(?url), "jpsearch.go.jp"))  . 
	?top semp:教育メタデータ ?e . ?e rdfs:label ?label . 
  }`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	{
		"mlabel": ["NHKアーカイブスの資料を使った教育メタデータ", "test"],
		"query" : 
`select distinct ?e ?label ?src ?src_label ?url ?image where {
	?top semp:元資料メタデータ/semp:元資料 ?src . 
	?src a  <https://w3id.org/sukilam-educational-metadata/元資料>;
		  rdfs:label ?src_label;
		  schema:image ?image;
		  schema:url ?url;
		  semp:元の資料の出典 ?ref . 
		  filter (regex(?ref, "NHKアーカイブス"))  . 
	?top semp:教育メタデータ ?e . ?e rdfs:label ?label . 
  }`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	},
	/*
	{
		"mlabel": ["filterPersuade", "filterPersuade"],
		"query" : 
`prefix owl: <http://www.w3.org/2002/07/owl#>
prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>
prefix xsd: <http://www.w3.org/2001/XMLSchema#>
prefix dprr: <http://romanrepublic.ac.uk/rdf/ontology#>
prefix fpo: <https://github.com/johnBradley501/FPO/raw/master/fpo.owl#>
prefix ex: <https://junjun7613.github.io/roman_factoid/Roman_Contextual_Factoid.owl#>

select ?factoid ?p ?ent where { 
?factoid ex:hasPredicate ?pred_ref.
?pred_ref ex:referencesPredicate <http://www.example.com/roman-ontology/resource/pred/persuade>.
?factoid ?p ?ent.
FILTER(?p != ex:hasPredicate)
FILTER(?p != rdf:type)
FILTER(?p != ex:mentionedAsPrecedent)
FILTER(?p != ex:mentionedAsParallel)
FILTER(?p != ex:mentionedAsFollow)
FILTER(?p != ex:therefore)
FILTER(?p != ex:because)
FILTER(?p != ex:then)
}
`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	}
	*/
];
