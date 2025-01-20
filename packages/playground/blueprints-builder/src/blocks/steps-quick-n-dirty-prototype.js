/**
 * This isn't actually built. To test, copy this code and paste it in devtools with Gutenberg open.
 * To do it in Playground, go to the "New post" page, open devtools and select "wp (post-new.php)"
 * as the context before pasting the code.
 *
 * We will want to use `.tsx` for this. Can we do it with vite? Or do we need a webpack setup?
 *
 * This is intentionally built by hand. No automated JSON to blocks conversion tool will give us
 * the great user experience we want, e.g. custom autocompleted inputs for selecting plugins from
 * the plugin directory.
 *
 * I've prototyped a non-block version of this at https://github.com/adamziel/blueprints-ui-builder.
 * Let's reuse as much of that as possible and useful here.
 *
 * TODOs:
 * - [ ] Reuse the site settings form introduced in https://github.com/WordPress/wordpress-playground/pull/1731 as
 *       a "Runtime configuration" section of the Blueprint builder. It has nice UI for selecting
 *       the WordPress version, multisite, debug mode, etc.
 *       Oh! Perhaps this block-based Blueprint builder could be embedded directly in that site
 *       settings form?! That form IS a Blueprint builder after all! TBD! But it would be lovely
 *       to have a builder integrated directly with the Playground experience AND also being a
 *       reusable, block-based package.
 *       TBD thinking about the applications of the PHP Blueprints library in the backend files of
 *       the block-based Blueprint builder.
 * - [ ] Attribute validation
 *    - [ ] JSON schema validators
 *    - [ ] UX – when is the validation performed? On every change? On button click? How is
 *          it communicated to the user? How do we set the expectations that a syntactically valid
 *          Blueprint may still fail at runtime?
 * - [ ] Split-pane Playground preview
 * - [ ] Blueprint -> blocks
 * - [ ] Blocks -> Blueprint
 * - [ ] Extensibility for "Custom steps", so what @amckirk built. A developer should be able to
 *       ship a block with a dedicated, ergonomic UI, call it a "Step", and turn it's output into
 *       a few JSON steps that achieve the desired outcome. Then, when editing, those JSON steps
 *       should be rendered in a code editor as that custom block.
 *       Tricky part: how to infer which block should be used? We can't just use sets of rules like
 *       "this sequence of steps = this block" as there might be multiple ambigous matches. Perhaps
 *       we'll need to explicitly label the steps with the block name. Or maybe we could introduce
 *       "Step IDs" and map IDs to block names? Or maybe we could have a "group step" that wraps a
 *       few "atomic steps" and does nothing on its own, but the editor can use it to map the child
 *       steps to the right custom block?
 * - [ ] ... probably a lot more ...
 */

(async function init() {
	function addOrUpdateCSS(css) {
		const styleId = 'playground-custom-css';
		let styleElement = document.getElementById(styleId);

		if (!styleElement) {
			styleElement = document.createElement('style');
			styleElement.id = styleId;
			document.head.appendChild(styleElement);
		}

		styleElement.textContent = css;
	}

	addOrUpdateCSS(`
        .step-container {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            border: 1px solid #ddd;
            padding: 0;
        }

        .step-container__header {
            box-sizing: border-box;
            width: 100%;
            font-size: 14px;
            border-bottom: 1px solid #ddd;
            padding: 10px;
        }
        
        .step-container__content {
            box-sizing: border-box;
            width: 100%;
            padding: 10px;

            display: flex;
            flex-direction: row;
            gap: 10px;
            align-items: stretch;
        }

        .step-container__content > :first-child:last-child {
            flex-grow: 1;
        }
    `);

	function forceRegisterBlock(name, opts) {
		try {
			window.wp.blocks.unregisterBlockType(name);
		} catch (e) {
			// console.log('Block not registered yet');
		}
		window.wp.blocks.registerBlockType(name, opts);
	}

	function decodeHtmlEntities(encodedString) {
		const parser = new DOMParser();
		const dom = parser.parseFromString(
			`<!doctype html><body>${encodedString}`,
			'text/html'
		);
		return dom.body.textContent;
	}

	function useQueryPlugins(inputValue) {
		const [data, setData] = window.wp.element.useState([]);
		const [fetchController, setFetchController] =
			window.wp.element.useState(null);

		window.wp.element.useEffect(() => {
			if (inputValue.trim().length > 0) {
				if (fetchController) {
					fetchController.abort();
				}

				const newController = new AbortController();
				setFetchController(newController);

				const debounceTimer = setTimeout(() => {
					fetch(
						`https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]=${inputValue}`,
						{ signal: newController.signal }
					)
						.then((response) => response.json())
						.then((responseData) => {
							const decodedPlugins = responseData.plugins
								.sort(
									(a, b) =>
										b.active_installs - a.active_installs
								)
								.map((plugin) => ({
									name: decodeHtmlEntities(plugin.name),
									slug: plugin.slug,
								}));
							setData(decodedPlugins);
						})
						.catch((error) => {
							if (error.name !== 'AbortError') {
								console.error('Fetch error:', error);
							}
						});
				}, 300); // 300ms debounce

				return () => {
					clearTimeout(debounceTimer);
					if (newController) {
						newController.abort();
					}
				};
			} else {
				setData([]);
			}
		}, [inputValue]);

		return { data };
	}

	forceRegisterBlock('playground/step-install-plugin', {
		title: 'Install a plugin',
		attributes: {
			resourceType: {
				type: 'string',
				default: 'wordpress.org/plugins',
			},
			resourceObject: {
				type: 'object',
				default: {
					resource: 'wordpress.org/plugins',
					slug: '',
				},
			},
		},
		edit: function ({ attributes, setAttributes }) {
			return window.wp.element.createElement(
				StepContainer,
				{ name: 'Install a plugin' },
				window.wp.element.createElement(ResourceTypeControl, {
					label: 'Plugin source',
					resourceType: attributes.resourceType,
					allowedResources: ['wordpress.org/plugins', 'url', 'file'],
					onChange: (newValue) =>
						setAttributes({
							resourceType: newValue,
						}),
				}),
				window.wp.element.createElement(
					window.wp.components.FlexItem,
					{ style: { flexGrow: 1 } },
					window.wp.element.createElement(ResourceControl, {
						resourceType: attributes.resourceType,
						initialResource: attributes.resourceObject,
						onChange: (newValue) =>
							setAttributes({ resourceObject: newValue }),
					})
				)
			);
		},
	});

	function useQueryThemes(inputValue) {
		const [data, setData] = window.wp.element.useState([]);
		const [fetchController, setFetchController] =
			window.wp.element.useState(null);

		window.wp.element.useEffect(() => {
			if (inputValue.trim().length > 0) {
				if (fetchController) {
					fetchController.abort();
				}

				const newController = new AbortController();
				setFetchController(newController);

				const debounceTimer = setTimeout(() => {
					fetch(
						`https://api.wordpress.org/themes/info/1.2/?action=query_themes&request[per_page]=100&request[search]=${inputValue}`,
						{ signal: newController.signal }
					)
						.then((response) => response.json())
						.then((responseData) => {
							const decodedThemes = responseData.themes.map(
								(theme) => ({
									name: decodeHtmlEntities(theme.name),
									slug: theme.slug,
									thumbnail: theme.screenshot_url,
								})
							);
							setData(decodedThemes);
						})
						.catch((error) => {
							if (error.name !== 'AbortError') {
								console.error('Fetch error:', error);
							}
						});
				}, 300); // 300ms debounce

				return () => {
					clearTimeout(debounceTimer);
					if (newController) {
						newController.abort();
					}
				};
			} else {
				setData([]);
			}
		}, [inputValue]);

		return { data };
	}

	forceRegisterBlock('playground/step-install-theme', {
		title: 'Install a theme',
		attributes: {
			resourceType: {
				type: 'string',
				default: 'wordpress.org/themes',
			},
			resourceObject: {
				type: 'object',
				default: {
					resource: 'wordpress.org/themes',
					slug: '',
				},
			},
		},
		edit: function ({ attributes, setAttributes }) {
			return window.wp.element.createElement(
				StepContainer,
				{ name: 'Install a theme' },
				window.wp.element.createElement(ResourceTypeControl, {
					label: 'Theme source',
					resourceType: attributes.resourceType,
					allowedResources: ['wordpress.org/themes', 'url', 'file'],
					onChange: (newValue) =>
						setAttributes({
							resourceType: newValue,
						}),
				}),
				window.wp.element.createElement(
					window.wp.components.FlexItem,
					{ style: { flexGrow: 1 } },
					window.wp.element.createElement(ResourceControl, {
						resourceType: attributes.resourceType,
						initialResource: attributes.resourceObject,
						onChange: (newValue) =>
							setAttributes({ resourceObject: newValue }),
					})
				)
			);
		},
	});

	// TODO: Source this from Blueprints TypeScript types.
	const resourceTypes = [
		'vfs',
		'literal',
		'wordpress.org/themes',
		'wordpress.org/plugins',
		'url',

		// Technically not a Blueprint resource type,
		// but we allow it here for good UX.
		'file',
	];

	function ResourceTypeControl({
		resourceType,
		allowedResources,
		onChange,
		...restProps
	}) {
		const options = [
			{
				value: 'wordpress.org/plugins',
				label: 'WordPress.org Plugins directory',
			},
			{
				value: 'wordpress.org/themes',
				label: 'WordPress.org Themes directory',
			},
			{ value: 'literal', label: 'Text' },
			{ value: 'vfs', label: 'VFS path' },
			{ value: 'url', label: 'URL' },
			{ value: 'file', label: 'Uploaded file' },
		];
		return window.wp.element.createElement(
			window.wp.components.SelectControl,
			{
				value: resourceType,
				onChange: onChange,
				options: options.filter((option) =>
					allowedResources.includes(option.value)
				),
				...restProps,
			}
		);
	}

	function ResourceControl({ resourceType, initialResource, onChange }) {
		const [perResourceState, setPerResourceState] =
			window.wp.element.useState(() => {
				const initialState = {};
				resourceTypes.forEach((type) => {
					initialState[type] = initialResource || {
						resource: type,
					};
				});
				return initialState;
			});

		const currentResource = perResourceState[resourceType];
		const setCurrentResource = (newResource) => {
			setPerResourceState({
				...perResourceState,
				[resourceType]: newResource,
			});
			onChange(newResource);
		};

		window.wp.element.useEffect(() => {
			if (currentResource.resource !== resourceType) {
				onChange(perResourceState[resourceType]);
			}
		}, [resourceType]);

		if (resourceType === 'wordpress.org/plugins') {
			return window.wp.element.createElement(PluginSlugInput, {
				initialValue: currentResource.slug,
				onChange: (newValue) =>
					setCurrentResource({
						...currentResource,
						slug: newValue,
					}),
			});
		}

		if (resourceType === 'wordpress.org/themes') {
			return window.wp.element.createElement(ThemeSlugInput, {
				initialValue: currentResource.slug,
				onChange: (newValue) =>
					setCurrentResource({
						...currentResource,
						slug: newValue,
					}),
			});
		}

		if (resourceType === 'url') {
			return window.wp.element.createElement(
				window.wp.components.__experimentalInputControl,
				{
					value: currentResource.url,
					type: 'url',
					label: 'URL',
					onChange: (newValue) =>
						setCurrentResource({
							...currentResource,
							url: newValue,
						}),
				}
			);
		}

		if (resourceType === 'literal') {
			return window.wp.element.createElement(
				window.wp.components.TextareaControl,
				{
					label: 'Text',
					value: currentResource.contents,
					onChange: (newValue) =>
						setCurrentResource({
							...currentResource,
							contents: newValue,
						}),
				}
			);
		}

		// Not an actual Blueprint resource type, but
		// we still allow it for good UX.
		if (resourceType === 'file') {
			return window.wp.element.createElement(
				window.wp.components.__experimentalInputControl,
				{
					type: 'file',
					onChange: (e) =>
						setCurrentResource({
							...currentResource,
							file: e.target.files[0],
						}),
					label: 'Upload a file',
					accept: '.zip',
				}
			);
		}

		if (resourceType === 'vfs') {
			return window.wp.element.createElement(
				window.wp.components.__experimentalInputControl,
				{
					value: currentResource.path,
					onChange: (newValue) =>
						setCurrentResource({
							...currentResource,
							path: newValue,
						}),
				}
			);
		}

		return window.wp.element.createElement(
			'div',
			null,
			'Unknown resource type: ',
			resourceType
		);
	}

	function PluginSlugInput({ initialValue, onChange }) {
		const uniqueId = window.wp.element.useMemo(
			() => Math.random().toString(36).substring(2, 15),
			[]
		);

		// Autocomplete plugin slug from the WordPress.org plugins API
		const [inputValue, setInputValue] =
			window.wp.element.useState(initialValue);
		const { data: matchingPlugins } = useQueryPlugins(inputValue);

		const handleInputChange = (newValue) => {
			setInputValue(newValue);
			onChange(newValue);
		};

		const handleOptionSelect = (selectedValue) => {
			onChange(selectedValue);
			// Don't update inputValue here to keep the current suggestions
		};

		return window.wp.element.createElement(
			window.wp.element.Fragment,
			null,
			window.wp.element.createElement(
				window.wp.components.__experimentalInputControl,
				{
					label: 'Plugin slug',
					value: inputValue,
					list: `plugin-slug-datalist-${uniqueId}`,
					onChange: handleInputChange,
					onInput: handleOptionSelect,
				}
			),
			window.wp.element.createElement(
				'datalist',
				{ id: `plugin-slug-datalist-${uniqueId}` },
				matchingPlugins.map((plugin) =>
					window.wp.element.createElement(
						'option',
						{ value: plugin.slug, key: plugin.slug },
						plugin.name
					)
				)
			)
		);
	}

	function ThemeSlugInput({ initialValue, onChange }) {
		const uniqueId = window.wp.element.useMemo(
			() => Math.random().toString(36).substring(2, 15),
			[]
		);

		// Autocomplete plugin slug from the WordPress.org plugins API
		const [inputValue, setInputValue] =
			window.wp.element.useState(initialValue);
		const { data: matchingThemes } = useQueryThemes(inputValue);

		const handleInputChange = (newValue) => {
			setInputValue(newValue);
			onChange(newValue);
		};

		const handleOptionSelect = (selectedValue) => {
			onChange(selectedValue);
			// Don't update inputValue here to keep the current suggestions
		};

		return window.wp.element.createElement(
			window.wp.element.Fragment,
			null,
			window.wp.element.createElement(
				window.wp.components.__experimentalInputControl,
				{
					label: 'Theme slug',
					value: inputValue,
					list: `theme-slug-datalist-${uniqueId}`,
					onChange: handleInputChange,
					onInput: handleOptionSelect,
				}
			),
			window.wp.element.createElement(
				'datalist',
				{ id: `theme-slug-datalist-${uniqueId}` },
				matchingThemes.map((theme) =>
					window.wp.element.createElement(
						'option',
						{ value: theme.slug, key: theme.slug },
						theme.thumbnail &&
							window.wp.element.createElement('img', {
								src: theme.thumbnail,
								alt: theme.name,
								style: { width: '60px', marginRight: '8px' },
							}),
						theme.name
					)
				)
			)
		);
	}

	forceRegisterBlock('playground/step-rm', {
		title: 'Remove a file',
		attributes: {
			path: {
				type: 'string',
				default: '',
			},
		},
		edit: function ({ attributes, setAttributes }) {
			return window.wp.element.createElement(
				StepContainer,
				{ name: 'Remove a file' },
				window.wp.element.createElement('input', {
					type: 'text',
					value: attributes.path,
					onChange: (e) => setAttributes({ path: e.target.value }),
				})
			);
		},
	});

	forceRegisterBlock('playground/step-rmdir', {
		title: 'Remove a directory',
		attributes: {
			path: {
				type: 'string',
				default: '',
			},
		},
		edit: function ({ attributes, setAttributes }) {
			return window.wp.element.createElement(
				StepContainer,
				{ name: 'Remove a directory' },
				window.wp.element.createElement('input', {
					type: 'text',
					value: attributes.path,
					onChange: (e) => setAttributes({ path: e.target.value }),
				})
			);
		},
	});

	forceRegisterBlock('playground/step-write-file', {
		title: 'Write a file',
		attributes: {
			path: {
				type: 'string',
				default: '',
			},
		},
		edit: function ({ attributes, setAttributes }) {
			// @TODO: Use CodeMirror and allow language selection
			return window.wp.element.createElement(
				StepContainer,
				{ name: 'Write a file' },
				window.wp.element.createElement('input', {
					type: 'text',
					value: attributes.path,
					onChange: (e) => setAttributes({ path: e.target.value }),
				})
			);
		},
	});

	forceRegisterBlock('playground/step-run-php', {
		title: 'Run PHP',
		attributes: {
			code: {
				type: 'string',
				default: '',
			},
		},
		edit: function ({ attributes, setAttributes }) {
			// @TODO: Use CodeMirror with PHP highligting
			return window.wp.element.createElement(
				StepContainer,
				{ name: 'Run PHP' },
				window.wp.element.createElement(
					window.wp.components.TextareaControl,
					{
						label: 'PHP code',
						value: attributes.code,
						onChange: (newValue) =>
							setAttributes({ code: newValue }),
					}
				)
			);
		},
	});

	function StepContainer({ name, children }) {
		return window.wp.element.createElement(
			'div',
			{ className: 'step-container' },
			window.wp.element.createElement(
				'div',
				{ className: 'step-container__header' },
				name
			),
			window.wp.element.createElement(
				'div',
				{ className: 'step-container__content' },
				children
			)
		);
	}
})();
