import { unzip } from '@wp-playground/blueprints';
import { activatePlugin } from '@wp-playground/blueprints';

type previewData = {
	zipPackage : ArrayBuffer;
	pluginName : String;
	pluginUrl  : String;
}

export class PreviewService
{
	static zipPackage : ArrayBuffer | null;
	static pluginName : String      | null;
	static pluginUrl  : String      | null;
	static hasPreview : Boolean     | null;

	static setPreview(previewData:previewData) {
		this.zipPackage = previewData.zipPackage;
		this.pluginName = previewData.pluginName;
		this.pluginUrl  = previewData.pluginUrl;
		this.hasPreview = true;
	}

	static clearPreview() {
		if(!this.hasPreview) {
			return;
		}
		this.zipPackage = null;
		this.pluginName = null;
		this.pluginUrl  = null;
		this.hasPreview = false;
	}

	static installPreview(playground: any)
	{
		const zipPackage = PreviewService.zipPackage;
		const pluginName = PreviewService.pluginName;
		const pluginUrl  = PreviewService.pluginUrl;

		if(!zipPackage)
		{
			return;
		}

		const ret = playground.writeFile('/wordpress/collector-init.html', '...')
		.then(() => playground.goTo(`/collector-init.html`))
		.then(() => playground.writeFile('/tmp/690013d3-b53b-43f2-8371-b293a3bdc4fb', ''))
		.then(() => playground.writeFile('/wordpress/data.zip', new Uint8Array(zipPackage)))
		.then(() => unzip(playground, {
			"zipPath": "/wordpress/data.zip",
			"extractToPath": "/wordpress"
		}))
		.then(() => activatePlugin(playground, {
			"pluginName": "Collector",
			"pluginPath": "/wordpress/wp-content/plugins/Collector"
		}))
		.then(() => playground.goTo(`/wp-content/plugins/Collector/please-wait.html`))
		.then(() => new Promise(accept => setTimeout(accept, 2500)))
		.then(() => {
			if(pluginUrl && pluginName)
			{
				return fetch(pluginUrl)
				.then(r => r.arrayBuffer())
				.then(arrayBuffer => playground.writeFile('/plugin.zip', new Uint8Array(arrayBuffer)))
				.then(() => unzip(playground, {
					"zipPath": "/plugin.zip",
					"extractToPath": "/wordpress/wp-content/plugins"
				}))
				.then(() => activatePlugin(playground, {
					"pluginName": pluginName,
					"pluginPath": "/wordpress/wp-content/plugins/" + pluginName
				})).then(() => {
					playground?.goTo(`/wp-admin/plugins.php`);
				});
			}
			else
			{
				return Promise.resolve();
			}
		});

		PreviewService.clearPreview();

		return ret;
	}
}
