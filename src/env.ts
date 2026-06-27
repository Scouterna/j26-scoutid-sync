import arkenv from "arkenv";
export const env = arkenv({
	"CACHE_MODE?": "'read' | 'write'",

	KEYCLOAK_BASE_URL: "string",
	KEYCLOAK_REALM_NAME: "string",
	KEYCLOAK_CLIENT_ID: "string",
	KEYCLOAK_CLIENT_SECRET: "string",
	KEYCLOAK_PARENT_GROUP_ID: "string",

	SCOUTNET_PROJECT_ID: "number",
	SCOUTNET_FORM_ID: "number",
	SCOUTNET_MEMBERS_API_KEY: "string",
	SCOUTNET_QUESTIONS_API_KEY: "string",

	"WRITE_CONCURRENCY?": "number",
	"READ_CONCURRENCY?": "number",
	"MAX_RETRIES?": "number",
});
