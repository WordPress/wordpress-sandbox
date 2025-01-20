---
slug: /contributing/code
---

# Code contributions

Like all WordPress projects, Playground uses GitHub to manage code and track issues. The main repository is at [https://github.com/WordPress/wordpress-playground](https://github.com/WordPress/wordpress-playground) and the Playground Tools repository is at [https://github.com/WordPress/playground-tools/](https://github.com/WordPress/playground-tools/).

:::info Contribute to Playground Tools

This guide includes links to the main repository, but all the steps and options apply for both. If you're interested in the plugins or local development tools—start there.

:::

Browse [the list of open issues](https://github.com/wordpress/wordpress-playground/issues) to find what to work on. The [`Good First Issue`](https://github.com/wordpress/wordpress-playground/issues?q=is%3Aopen+is%3Aissue+label%3A%22Good+First+Issue%22) label is a recommended starting point for first-time contributors.

Be sure to review the following resources before you begin:

-   [Coding principles](/contributing/coding-standards)
-   [Architecture](/developers/architecture)
-   [Vision and Philosophy](https://github.com/WordPress/wordpress-playground/issues/472)
-   [WordPress Playground Roadmap](https://github.com/WordPress/wordpress-playground/issues/525)

## Contribute Pull Requests

[Fork the Playground repository](https://github.com/WordPress/wordpress-playground/fork) and clone it to your local machine. To do that, copy and paste these commands into your terminal:

```bash
git clone -b trunk --single-branch --depth 1 --recurse-submodules

# replace `YOUR-GITHUB-USERNAME` with your GitHub username:
git@github.com:YOUR-GITHUB-USERNAME/wordpress-playground.git
cd wordpress-playground
npm install
```

Create a branch, make changes, and test it locally by running the following command:

```bash
npm run dev
```

Playground will open in a new browser tab and refresh automatically with each change.

When your'e ready, commit the changes and submit a Pull Request.

:::info Formatting

We handle code formatting and linting automatically. Relax, type away, and let the machines do the work.

:::

### Running a local Multisite

WordPress Multisite has a few [restrictions when run locally](https://developer.wordpress.org/advanced-administration/multisite/prepare-network/#restrictions). If you plan to test a Multisite network using Playground's `enableMultisite` step, make sure you either change `wp-now`'s default port or set a local test domain running via HTTPS.

To change `wp-now`'s default port to the one supported by WordPress Multisite, run it using the `--port=80` flag:

```bash
npx @wp-now/wp-now start --port=80
```

There are a few ways to set up a local test domain, including editing your `hosts` file. If you're unsure how to do that, we suggest installing [Laravel Valet](https://laravel.com/docs/11.x/valet) and then running the following command:

```bash
valet proxy playground.test http://127.0.0.1:5400 --secure
```

Your dev server is now available on https://playground.test.

## Debugging

### Use VS Code and Chrome

If you're using VS Code and have Chrome installed, you can debug Playground in the code editor:

-   Open the project folder in VS Code.
-   Select Run > Start Debugging from the main menu or press `F5`/`fn`+`F5`.

### Debugging PHP

Playground logs PHP errors in the browser console after every PHP request.

## Publishing packages

Playground consists of a number of packages, some of which are published to npmjs.com, under the `@wp-playground/` _organization_. While packages are normally automatically published through a [GitHub Action](https://github.com/WordPress/wordpress-playground/actions/workflows/publish-npm-packages.yml), it's also possible to do so from a local machine by running the same script that the GitHub Action runs.

Additionally, it's possible to test-publish packages to a local registry, so that changes can be tested without publishing the package to npmjs.com.

The release process is automated through [lerna](https://lerna.js.org).

### Versioning strategy

Playground's versioning strategy is to use the same version for all packages, **but** only packages that need to be released are bumped to the new version. As an example, lets consider the following scenario:

-   All packages are currently at `v1.0.0`
-   The following packages have changes since `v1.0.0`: `@wp-playground/cli` and `@wp-playground/remote`

When we issue a new release, only `@wp-playground/cli` and `@wp-playground/remote` will be bumped to `v1.0.1`, and all other packages will remain at `v1.0.0`.

### Authenticating with npmjs.com

TODO

### Issuing a new release

Normally, packages are automatically published through a [GitHub Action](https://github.com/WordPress/wordpress-playground/actions/workflows/publish-npm-packages.yml), but if you so wish, you can release from your machine as well.

The release process is automated through [lerna](https://lerna.js.org), which automatically figures out which packages need to be released, and what the new version should be. To issue a new release, you call `lerna` through the following script:

> Please note that the following command **will publish packages to npmjs.com** (provided that you are authenticated with an account that has permissions to do so).

```shell
npm run release
```

### Publishing to a local registry

Instead of publishing to npmjs.com, you can publish packages to a local registry that is running in your machine. This local registry is provided by [verdaccio](https://verdaccio.org). The sections below describe how to do this.

### Enabling the local registry

Start the local registry with:

```shell
npm run local-registry:start
```

> You should now be able to access the local registry's UI at [http://localhost:4873](http://localhost:4873)

To switch the target registry of `npm` so that it uses the local registry instead of npmjs.com, you can use the following command:

```shell
npm run local-registry:enable
```

### Releasing to the local registry

At this point, the local registry is running and all `npm` commands will target it, so you can publish packages as you normally would, but they will be published to the local registry instead:

```shell
# Note that we're using `release:no-push` instead of `release` because we don't
# want commits or tags to be created, as we're just test-publishing.
npm run release:no-push
```

Once the above command has ran, packages have been published to the local registry, and should be visible (and downloadable) from the local registry's UI at [http://localhost:4873](http://localhost:4873).

### Disabling the local registry

To disable the local registry, and make `npm` talk to npmjs.com again, you can:

```shell
npm run local-registry:disable
```

To clear all data of the local registry (useful if, for example, you have test-published a package and want to test-publish it again), you can use the following:

```shell
npm run local-registry:clear
```
