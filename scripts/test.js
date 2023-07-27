const concurrently = require('concurrently');
const fs = require('fs-extra');
const { logError } = require('./common.js');
const {
	generateUmdAritfactsFixtures,
} = require('./generate-umd-artifacts-fixtures');

const defaultTimeout = 5 * 60 * 1000; // 5 minutes

const FRAMEWORKS = {
	react: 'react',
	angular: 'angular',
	ionic: 'ionic',
	vue: 'vue',
	node: 'node',
	javascript: 'javascript',
	next: 'next',
	vite: 'vite',
	rollup: 'rollup',
};

const BUILD_TYPE = {
	dev: 'dev',
	prod: 'prod',
};

const frameworkPort = {
	[FRAMEWORKS.react]: '3000',
	[FRAMEWORKS.angular]: '4200',
	[FRAMEWORKS.ionic]: '8100',
	[FRAMEWORKS.vue]: '8080',
	[FRAMEWORKS.javascript]: '3000',
	[FRAMEWORKS.next]: '3000',
	[FRAMEWORKS.vite]: '3000',
	[FRAMEWORKS.rollup]: '3000',
};

const SUPPORTED_BROWSERS = [
	'chrome',
	'chromium',
	'edge',
	'electron',
	'firefox',
	'webkit',
];
const isSupportedBrowser = browser => {
	return SUPPORTED_BROWSERS.includes(browser);
};

// Read arguments from process.argv, validate them, and assign defaults. Returns the parameter list.
const getParameters = () => {
	let [
		framework,
		category,
		sample,
		testFile,
		browser,
		build,
		amplifyJsDir,
	] = process.argv.slice(2);
	if (!framework || !FRAMEWORKS.hasOwnProperty(framework)) {
		logError(`Please enter a valid framework: ${[...Object.keys(FRAMEWORKS)]}`);
		process.exit(1);
	}

	if (framework === 'javascript' && !amplifyJsDir) {
		logError(`Please enter path to Amplify JS workspace directory`);
		process.exit(1);
	}

	if (!category) {
		logError('Please enter a valid category');
		process.exit(1);
	}
	if (!sample || !fs.existsSync(`samples/${framework}/${category}/${sample}`)) {
		logError('Please enter a valid sample name');
		process.exit(1);
	}
	if (!testFile) {
		testFile = sample;
	}
	if (!browser || !isSupportedBrowser(browser)) {
		browser = 'chrome';
	}
	if (!build || !BUILD_TYPE.hasOwnProperty(build)) {
		build = 'dev';
	}
	return {
		framework,
		category,
		sample,
		testFile,
		browser,
		build,
		amplifyJsDir,
	};
};

// bash command for installing node_modules if it is not present
// TODO: remove --ignore-engines when we update the cypress image
const yarnInstall = sampleDir => {
	return fs.existsSync(`${sampleDir}/node_modules`)
		? `echo "Skipping yarn install"`
		: `yarn --cwd ${sampleDir} --ignore-engines`;
};

const sampleDirectory = ({ framework, category, sample }) => {
	return `samples/${framework}/${category}/${sample}`;
};

// bash command for serving sample on prod
const runAppOnProd = ({ framework, category, sample }) => {
	const sampleDir = sampleDirectory({ framework, category, sample });
	let distDir; // distribution directory
	if (framework === FRAMEWORKS.angular) {
		const { name } = JSON.parse(fs.readFileSync(`${sampleDir}/package.json`));
		distDir = `${sampleDir}/dist/${name}`;
	} else if (framework === FRAMEWORKS.react || framework === FRAMEWORKS.next) {
		distDir = `${sampleDir}/build`;
	} else if (framework === FRAMEWORKS.vue || framework === FRAMEWORKS.vite) {
		distDir = `${sampleDir}/dist`;
	} else if (framework === FRAMEWORKS.rollup) {
		distDir = `${sampleDir}/public`;
	} else if (framework === FRAMEWORKS.ionic) {
		distDir = `${sampleDir}/www`;
	} else if (framework === FRAMEWORKS.javascript) {
		distDir = `${sampleDir}/dist`;
	} else {
		logError(`unknown framework: ${framework}`);
	}
	// angular requires --prod flag on yarn build
	const prodFlag = framework === 'angular' ? '--prod' : '';
	const install = yarnInstall(sampleDir);
	const serveCommand =
		framework === 'next'
			? `yarn --cwd ${sampleDir} start`
			: `serve -s ${distDir} -l ${frameworkPort[framework]}`;
	return `${install} && yarn --cwd ${sampleDir} build ${prodFlag} && ${serveCommand}`;
};

// bash command for serving sample on dev
const runAppOnDev = ({ framework, category, sample }) => {
	const sampleDir = sampleDirectory({ framework, category, sample });
	const install = yarnInstall(sampleDir);
	const startScript = framework === 'next' ? 'dev' : 'start';
	return `${install} && yarn --cwd ${sampleDir} ${startScript}`;
};

const startSampleAndRun = async () => {
	const params = getParameters();
	const {
		framework,
		category,
		testFile,
		browser,
		build,
		sample,
		amplifyJsDir,
	} = params;
	const sampleDir = sampleDirectory({ framework, category, sample });

	if (framework === 'javascript') {
		await generateUmdAritfactsFixtures(amplifyJsDir);
	}

	// commands
	const runApp =
		build === BUILD_TYPE.dev ? runAppOnDev(params) : runAppOnProd(params);
	const runCypress = `wait-on -t ${defaultTimeout} tcp:${frameworkPort[framework]} && cypress run --browser ${browser} --headless --config baseUrl=http://localhost:${frameworkPort[framework]} --spec "cypress/integration/${category}/${testFile}.spec.*"`;
	const installAndRunNodeTests = `${yarnInstall(
		sampleDir
	)} && yarn --cwd ${sampleDir} test`;

	return concurrently(
		framework === FRAMEWORKS.node
			? [installAndRunNodeTests]
			: [runApp, runCypress],
		{
			killOthers: ['success', 'failure'],
			successCondition: ['first'],
		}
	)
		.then(() => {
			process.exit(0);
		})
		.catch(exitInfos => {
			// Concurrently throws SIGTERM with exit code 0 on success, check code and exit with it
			const { exitCode } = exitInfos[0];
			process.exit(exitCode);
		});
};

(async () => {
	try {
		await startSampleAndRun();
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();