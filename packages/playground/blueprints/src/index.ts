// Blueprints require WordPress Playground's Node polyfills.
import '@php-wasm/node-polyfills';

export * from './lib/steps';
export * from './lib/steps/handlers';
export { runBlueprintSteps, compileBlueprint } from './lib/compile';
export type { Blueprint, PHPConstants } from './lib/blueprint';
export type {
	CompiledStep,
	CompiledBlueprint,
	CompileBlueprintOptions,
	OnStepCompleted,
} from './lib/compile';
export type {
	BlueprintAssetReference,
	BlueprintAssetDirectoryReference,
	CachedResource,
	CorePluginReference,
	CorePluginResource,
	CoreThemeReference,
	CoreThemeResource,
	ResourceDecorator,
	FetchResource,
	FileReference,
	LiteralReference,
	LiteralResource,
	Resource,
	ResourceTypes,
	SemaphoreResource,
	UrlReference,
	UrlResource,
	VFSReference,
	VFSResource,
} from './lib/resources';

export { wpContentFilesExcludedFromExport } from './lib/utils/wp-content-files-excluded-from-exports';

/**
 * @deprecated This function is a no-op. Playground no longer uses a proxy to download plugins and themes.
 *             To be removed in v0.3.0
 */
export function setPluginProxyURL() {}
