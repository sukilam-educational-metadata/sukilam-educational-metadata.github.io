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
	/*
	{
		"mlabel": ["教材一覧", "test"],
		"query" : 
`select * where {
	?s a <http://example.org/教育メタデータ>
}`,
		"ns" : [ ]	// list of ns prefixes defined in example_ns, if necessary 必要に応じてexample_nsで定義した接頭辞リスト
	}
	*/
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
