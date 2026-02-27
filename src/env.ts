import arkenv from "arkenv";
export const env = arkenv({
	"CACHE_MODE?": "'read' | 'write'",

	KEYCLOAK_CLIENT_ID: "string",
	KEYCLOAK_CLIENT_SECRET: "string",
	KEYCLOAK_PARENT_GROUP_ID: "string",

	SCOUTNET_PROJECT_ID: "number",
	SCOUTNET_FORM_ID: "number",
	SCOUTNET_MEMBERS_API_KEY: "string",
	SCOUTNET_QUESTIONS_API_KEY: "string",
});
