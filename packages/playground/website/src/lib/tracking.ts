import { Blueprint, isStepDefinition } from '@wp-playground/blueprints';
import { logger } from '@php-wasm/logger';

/**
 * Declare the global window.gtag function
 */
declare global {
	interface Window {
		gtag: any;
	}
}

/**
 * Google Analytics event names
 */
type GAEvent = 'load' | 'step' | 'installPlugin' | 'installTheme' | 'error';

/**
 * Log a tracking event to Google Analytics
 * @param GAEvent The event name
 * @param Object Event data
 */
export const logTrackingEvent = (
	event: GAEvent,
	data?: { [key: string]: string }
) => {
	try {
		if (typeof window === 'undefined' || !window.gtag) {
			return;
		}
		window.gtag('event', event, data);
	} catch (error) {
		logger.warn('Failed to log tracking event', event, data, error);
	}
};

/**
 * Log error events
 *
 * @param error The error
 */
export const logErrorEvent = (source: string) => {
	logTrackingEvent('error', {
		source,
	});
};

/**
 * Log plugin install events
 * @param slug The plugin slug
 */
export const logPluginInstallEvent = (slug: string) => {
	logTrackingEvent('installPlugin', {
		plugin: slug,
	});
};

/**
 * Log theme install events
 * @param slug The theme slug
 */
export const logThemeInstallEvent = (slug: string) => {
	logTrackingEvent('installTheme', {
		theme: slug,
	});
};

/**
 * Log Blueprint events
 * @param blueprint The Blueprint
 */
export const logBlueprintEvents = (blueprint: Blueprint) => {
	/**
	 * Log the names of provided Blueprint steps.
	 * Only the names (e.g. "runPhp" or "login") are logged. Step options like
	 * code, password, URLs are never sent anywhere.
	 *
	 * For installPlugin and installTheme, the plugin/theme slug is logged.
	 */
	if (blueprint.steps) {
		for (const step of blueprint.steps) {
			if (!isStepDefinition(step)) {
				continue;
			}
			logTrackingEvent('step', { step: step.step });
			if (
				step.step === 'installPlugin' &&
				(step as any).pluginData.slug
			) {
				logPluginInstallEvent((step as any).pluginData.slug);
			} else if (
				step.step === 'installTheme' &&
				(step as any).themeData.slug
			) {
				logThemeInstallEvent((step as any).themeData.slug);
			}
		}
	}

	/**
	 * Because the Blueprint isn't compiled, we need to log the plugins
	 * that are installed using the `plugins` shorthand.
	 */
	if (blueprint.plugins) {
		for (const plugin of blueprint.plugins) {
			if (typeof plugin !== 'string') {
				continue;
			}
			logTrackingEvent('step', { step: 'installPlugin' });
			logPluginInstallEvent(plugin);
		}
	}
};
