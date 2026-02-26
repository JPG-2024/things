export const CONTENT_EXTRACTION_SCHEMA = {
	type: "json_schema",
	json_schema: {
		name: "info",
		schema: {
			properties: {
				dates: {
					title: "Dates",
					type: "string",
					description: "Fechas relevantes del contenido.",
				},
				keywords: {
					title: "Keywords",
					type: "array",
					description: "Keywords principales del contenido.",
				},
				category: {
					title: "Category",
					type: "string",
					description: "La categoría a la que pertenece el contenido.",
					enum: ["Artificial Intelligence", "Healthy", "Programming", "Games"],
				},
			},
			required: ["keywords", "category"],
		},
	},
}
