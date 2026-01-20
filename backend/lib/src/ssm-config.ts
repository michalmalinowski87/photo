import { SSMClient, GetParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});

// Cache for SSM parameters to avoid repeated API calls
const parameterCache: Record<string, { value: string; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

function isRunningInLambda(): boolean {
	const envProc = (globalThis as any).process;
	return !!envProc?.env?.AWS_LAMBDA_FUNCTION_NAME;
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * Reads a single parameter from SSM Parameter Store
 * @param parameterName - Full parameter name (e.g., /PhotoHub/dev/CognitoUserPoolId)
 * @param useCache - Whether to use cached value (default: true)
 * @returns Parameter value or undefined if not found
 */
export async function getSsmParameter(
	parameterName: string,
	useCache: boolean = true
): Promise<string | undefined> {
	// Check cache first
	if (useCache && parameterCache[parameterName]) {
		const cached = parameterCache[parameterName];
		if (Date.now() - cached.timestamp < CACHE_TTL) {
			return cached.value;
		}
	}

	try {
		const result = await ssm.send(new GetParameterCommand({
			Name: parameterName,
			WithDecryption: true // Decrypt SecureString parameters
		}));

		const value = result.Parameter?.Value;
		if (value) {
			parameterCache[parameterName] = {
				value,
				timestamp: Date.now()
			};
		}
		return value;
	} catch (error: any) {
		if (error.name === 'ParameterNotFound') {
			return undefined;
		}
		throw error;
	}
}

/**
 * Reads multiple parameters from SSM Parameter Store in a single call
 * @param parameterNames - Array of parameter names
 * @param useCache - Whether to use cached values (default: true)
 * @returns Map of parameter names to values
 */
export async function getSsmParameters(
	parameterNames: string[],
	useCache: boolean = true
): Promise<Record<string, string | undefined>> {
	const result: Record<string, string | undefined> = {};
	const uncachedNames: string[] = [];

	// Check cache first
	for (const name of parameterNames) {
		if (useCache && parameterCache[name]) {
			const cached = parameterCache[name];
			if (Date.now() - cached.timestamp < CACHE_TTL) {
				result[name] = cached.value;
			} else {
				uncachedNames.push(name);
			}
		} else {
			uncachedNames.push(name);
		}
	}

	// Fetch uncached parameters
	if (uncachedNames.length > 0) {
		try {
			const ssmResult = await ssm.send(new GetParametersCommand({
				Names: uncachedNames,
				WithDecryption: true
			}));

			// Map results by name
			const invalidParams = ssmResult.InvalidParameters || [];
			for (const param of ssmResult.Parameters || []) {
				if (param.Name && param.Value) {
					result[param.Name] = param.Value;
					parameterCache[param.Name] = {
						value: param.Value,
						timestamp: Date.now()
					};
				}
			}

			// Mark invalid parameters as undefined
			for (const invalidName of invalidParams) {
				result[invalidName] = undefined;
			}
		} catch (error: any) {
			// If batch fetch fails, fall back to individual fetches
			for (const name of uncachedNames) {
				try {
					const value = await getSsmParameter(name, false);
					result[name] = value;
				} catch (err: any) {
					result[name] = undefined;
				}
			}
		}
	}

	return result;
}

/**
 * Gets configuration values from SSM Parameter Store
 * Constructs parameter names using the stage
 * @param stage - Deployment stage (e.g., 'dev', 'prod')
 * @param configKeys - Array of configuration keys (e.g., ['CognitoUserPoolId', 'JwtSecret'])
 * @returns Map of config keys to values
 */
export async function getConfigFromSsm(
	stage: string,
	configKeys: string[]
): Promise<Record<string, string | undefined>> {
	const parameterNames = configKeys.map(key => `/PhotoHub/${stage}/${key}`);
	const parameters = await getSsmParameters(parameterNames);
	
	// Map back to config keys
	const result: Record<string, string | undefined> = {};
	for (let i = 0; i < configKeys.length; i++) {
		result[configKeys[i]] = parameters[parameterNames[i]];
	}
	
	return result;
}

/**
 * Gets a single configuration value from SSM Parameter Store
 * @param stage - Deployment stage
 * @param configKey - Configuration key (e.g., 'CognitoUserPoolId')
 * @returns Configuration value or undefined
 */
export async function getConfigValueFromSsm(
	stage: string,
	configKey: string
): Promise<string | undefined> {
	const parameterName = `/PhotoHub/${stage}/${configKey}`;
	return getSsmParameter(parameterName);
}

export type RequiredConfigOptions = {
	/**
	 * Environment variable name used ONLY for local development.
	 * In AWS Lambda, SSM is always the source of truth and env fallback is not allowed.
	 */
	envVarName?: string;
};

/**
 * Gets a required configuration value.
 *
 * Rules:
 * - In AWS Lambda: must be present in SSM (/PhotoHub/<stage>/<key>), no env fallback.
 * - Locally: must be present in process.env[envVarName] (if provided).
 */
export async function getRequiredConfigValue(
	stage: string,
	configKey: string,
	options: RequiredConfigOptions = {}
): Promise<string> {
	const envProc = (globalThis as any).process;

	if (isRunningInLambda()) {
		const parameterName = `/PhotoHub/${stage}/${configKey}`;
		const ssmValue = asNonEmptyString(await getSsmParameter(parameterName));
		if (!ssmValue) {
			throw new Error(
				`Missing required SSM parameter: ${parameterName}. ` +
					`This value must be set in AWS SSM Parameter Store for non-local environments.`
			);
		}
		return ssmValue;
	}

	if (options.envVarName) {
		const envValue = asNonEmptyString(envProc?.env?.[options.envVarName]);
		if (!envValue) {
			throw new Error(
				`Missing required environment variable: ${options.envVarName}. ` +
					`This is required for local development. (SSM key: /PhotoHub/${stage}/${configKey})`
			);
		}
		return envValue;
	}

	throw new Error(
		`Missing required configuration for local development: env var not specified. ` +
			`(SSM key: /PhotoHub/${stage}/${configKey})`
	);
}

/**
 * Gets a configuration value from SSM Parameter Store with fallback to environment variable
 * This provides backward compatibility during migration
 * @param stage - Deployment stage
 * @param configKey - Configuration key (e.g., 'JwtSecret')
 * @param envVarName - Environment variable name to fallback to (e.g., 'JWT_SECRET')
 * @returns Configuration value or undefined
 */
export async function getConfigWithEnvFallback(
	stage: string,
	configKey: string,
	envVarName: string
): Promise<string | undefined> {
	const ssmValue = await getConfigValueFromSsm(stage, configKey);
	if (ssmValue) {
		return ssmValue;
	}
	// Fallback to environment variable for backward compatibility
	const envProc = (globalThis as any).process;
	return envProc?.env?.[envVarName] as string | undefined;
}

/**
 * Gets multiple configuration values from SSM Parameter Store with fallback to environment variables
 * @param stage - Deployment stage
 * @param configMap - Map of config keys to env var names (e.g., { JwtSecret: 'JWT_SECRET', StripeSecretKey: 'STRIPE_SECRET_KEY' })
 * @returns Map of config keys to values
 */
export async function getConfigsWithEnvFallback(
	stage: string,
	configMap: Record<string, string>
): Promise<Record<string, string | undefined>> {
	const configKeys = Object.keys(configMap);
	const ssmValues = await getConfigFromSsm(stage, configKeys);
	
	const result: Record<string, string | undefined> = {};
	const envProc = (globalThis as any).process;
	
	for (const configKey of configKeys) {
		const ssmValue = ssmValues[configKey];
		if (ssmValue) {
			result[configKey] = ssmValue;
		} else {
			// Fallback to environment variable
			const envVarName = configMap[configKey];
			result[configKey] = envProc?.env?.[envVarName] as string | undefined;
		}
	}
	
	return result;
}

