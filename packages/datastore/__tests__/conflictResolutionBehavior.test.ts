import { warpTime, unwarpTime, pause } from './helpers';
import { UpdateSequenceHarness } from './helpers/UpdateSequenceHarness';

/**
 * NOTE:
 * The following test assertions are based on *existing* behavior, not *correct*
 * behavior. Once we have fixed rapid single-field consecutive updates, and updates on a
 * poor connection, we should update these assertions to reflect the *correct* behavior.
 *
 * WHAT WE ARE TESTING:
 * Test observed rapid single-field mutations with variable connection latencies, as well as
 * waiting / not waiting on the outbox between mutations. All permutations are necessary,
 * as each scenario results in different observed behavior - essentially, whether or not
 * the outbox merges updates. We are updating a single field with each mutation to ensure
 * that the outbox's `syncOutboxVersionsOnDequeue` does the right value comparison when
 * there are multiple fields present on a model, but only one is updated.
 *
 * NOTE: if these tests fail, and you witness one of the following:
 *     1) The retry throws an error
 *     2) The number of observed updates has changed
 *     3) The record's final version number has changed
 * make sure you haven't adjusted the artifical latency or `pause` values, as this will
 * result in a change in the expected number of merges performed by the outbox.
 *
 * NOTES ON HOW WE PERFORM CONSECUTIVE UPDATES:
 *
 * When we want to test a scenario where the outbox does not necessarily merge all outgoing
 * requests (for instance, when we do not add artifical latency to the connection), we make
 * the mutations rapidly (i.e. we don't await the outbox). However, because of how
 * rapidly the mutations are performed, we are creating an artifical situation where
 * mutations will always be merged. Adding a slight pause between mutations dds a
 * semi-realistic pause ("button clicks") between updates. This is not required when awaiting
 * the outbox after each mutation. Additionally, a pause is not required if we are
 * intentionally testing rapid updates, such as when the initial save is still pending.
 *
 * When we want to test a scenario where the user is waiting for a long period of time
 * between each mutation (non-concurrent updates), we wait for an empty outbox after each
 * mutation. This ensures each mutation completes a full cycle before the next mutation
 * begins. This guarantees that there will NEVER be concurrent updates being processed by
 * the outbox.
 */
describe('DataStore sync engine', () => {
	let harness: UpdateSequenceHarness;

	beforeEach(async () => {
		// we don't need to see all the console warnings for these tests ...
		(console as any)._warn = console.warn;
		console.warn = () => {};
	});

	afterEach(async () => {
		console.warn = (console as any)._warn;
	});

	describe('Automerge conflict resolution', () => {
		beforeEach(async () => {
			harness = new UpdateSequenceHarness('Automerge');
			await harness.startDatastore();
		});

		afterEach(async () => {
			await harness.destroy();
		});
		describe('connection state change handling', () => {
			beforeEach(async () => {
				warpTime();
			});

			afterEach(async () => {
				unwarpTime();
			});

			describe('observed rapid single-field mutations with variable connection latencies', () => {
				describe('single client updates', () => {
					test('slow connection speed, high latency where we wait for the create to clear the outbox', async () => {
						/**
						 * Slow connection speed is simulated by running datastore commands as quickly as possible,
						 * leaving little time for internal resolution before the next command runs.
						 */
						harness.connectionSpeed = 'slow';
						/**
						 * High latency is simulated by adding time around graphql calls and before subscriptions
						 * are updated to demonstrate behavior when the datastore updates locally, but is latent
						 * syncing out to graphql.
						 */
						harness.latency = 'high';
						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(2);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 1', 1],
							['post title 2', 1],
							['post title 0', 3],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 3,
							title: 'post title 0',
						});
					});
					test('fast connection speed, low latency where we wait for the create to clear the outbox', async () => {
						/**
						 * Fast connection speed is simulated by running datastore commands as discretely as
						 * possible, waiting 200ms between each command for internal resolution before the next command runs.
						 */
						harness.connectionSpeed = 'fast';
						/**
						 * Low latency is simulated by keeping very little time around graphql calls and before
						 * subscriptions are updated to demonstrate behavior when the datastore updates locally,
						 * and is quickly syncing out to graphql.
						 */
						harness.latency = 'low';
						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						// Note: We do NOT wait for the outbox to be empty here, because
						// we want to test concurrent updates being processed by the outbox.
						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(3);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 1', 1],
							['post title 2', 1],
							['post title 0', 4],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 4,
							title: 'post title 0',
						});
					});
					test('slow connection speed, high latency where we DO NOT wait for the create to clear the outbox', async () => {
						harness.connectionSpeed = 'slow';
						harness.latency = 'high';

						// Note: We do NOT wait for the outbox to be empty here, because
						// we want to test concurrent updates being processed by the outbox.
						const postHarness = await harness.createPostHarness(
							{
								title: 'original title',
								blogId: 'blog id',
							},
							false
						);

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(0);

						expect(harness.subscriptionLogs()).toEqual([
							['post title 0', undefined],
							['post title 1', undefined],
							['post title 2', undefined],
							['post title 2', 1],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 1,
							title: 'post title 2',
						});
					});
					test('fast connection speed, low latency where we DO NOT wait for the create to clear the outbox', async () => {
						harness.connectionSpeed = 'fast';
						harness.latency = 'low';

						// Note: We do NOT wait for the outbox to be empty here, because
						// we want to test concurrent updates being processed by the outbox.
						const postHarness = await harness.createPostHarness(
							{
								title: 'original title',
								blogId: 'blog id',
							},
							false
						);

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(0);

						expect(harness.subscriptionLogs()).toEqual([
							['post title 0', undefined],
							['post title 1', undefined],
							['post title 2', undefined],
							['post title 2', 1],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 1,
							title: 'post title 2',
						});
					});
					test('slow connection speed, high latency where we wait for all mutations to clear the outbox', async () => {
						harness.connectionSpeed = 'slow';
						harness.latency = 'high';
						/**
						 * We wait for the empty outbox on each mutation, because
						 * we want to test non-concurrent updates (i.e. we want to make
						 * sure all the updates are going out and are being observed)
						 */
						harness.settleOutboxAfterRevisions = true;

						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.expectUpdateCallCount(3);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 0', 2],
							['post title 1', 2],
							['post title 1', 3],
							['post title 2', 3],
							['post title 2', 4],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 4,
							title: 'post title 2',
						});
					});
					test('slow connection speed, low latency where we wait for all mutations to clear the outbox', async () => {
						harness.connectionSpeed = 'slow';
						harness.latency = 'low';
						harness.settleOutboxAfterRevisions = true;
						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.expectUpdateCallCount(3);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 0', 2],
							['post title 1', 2],
							['post title 1', 3],
							['post title 2', 3],
							['post title 2', 4],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 4,
							title: 'post title 2',
						});
					});
				});

				/**
				 * The following multi-client tests are almost identical to the single-client tests above:
				 * as a result, the comments in these tests relate specifically to multi-client operations only.
				 * The primary differences are that we inject external client updates, and add many permutations
				 * on essentially the same patterns. For a complete understanding of how these tests work (why /
				 * when we await the outbox, pause, wait for the service to settle, etc), refer to the
				 * single-field tests.
				 */
				describe('Multi-client updates', () => {
					describe('Updates to the same field', () => {
						test('slow connection speed, high latency where we wait for the create to clear the outbox', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'high';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');
							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 1,
							});
							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(3);
							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 1', 1],
								['post title 2', 1],
								['update from second client', 4],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 4,
								title: 'update from second client',
							});
						});
						test('fast connection speed, low latency where we wait for the create to clear the outbox', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');
							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 1,
							});
							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 1', 1],
								['post title 2', 1],
								['post title 0', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 0',
							});
						});
						test('fast connection speed, high latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'high';
							harness.settleOutboxAfterRevisions = true;
							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 3,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 0', 2],
								['post title 1', 2],
								['post title 1', 3],
								['update from second client', 4],
								['post title 2', 4],
								['post title 2', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
							});
						});
						test('fast connection speed, low latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';
							harness.settleOutboxAfterRevisions = true;

							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 3,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 0', 2],
								['post title 1', 2],
								['post title 1', 3],
								['update from second client', 4],
								['post title 2', 4],
								['post title 2', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
							});
						});
					});

					/**
					 * NOTE: Even though the primary client is updating `title`,
					 * the second client's update to `blogId` "reverts" the primary
					 * client's changes. This is because the external update takes
					 * effect while the primary client's updates are still in flight.
					 * By the time the primary client's update reaches the service,
					 * the `_version` has changed. As a result, auto-merge chooses
					 * the existing server-side `title` over the proposed updated
					 * `title`. The following two tests demonstrate this behavior,
					 * with a difference in the timing of the external request,
					 * ultimately resulting in different final states.
					 */
					describe('Updates to different fields', () => {
						test('fast connection speed, high latency where external request is first received update after create', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'high';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(3);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 1', null, 1],
								['post title 2', null, 1],
								['original title', 'update from second client', 4],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 4,
								title: 'original title',
								blogId: 'update from second client',
							});
						});
						test('slow connection speed, high latency where external request is second received update', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'high';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							/**
							 * Ensure that the external update is received after the
							 * primary client's first update.
							 */
							await pause(3000);

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 1', null, 1],
								['post title 2', null, 1],
								['post title 0', 'update from second client', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 0',
								blogId: 'update from second client',
							});
						});
						test('fast connection speed, low latency where second field is created `null`', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';

							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 1', null, 1],
								['post title 2', null, 1],
								['post title 0', 'update from second client', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 0',
								blogId: 'update from second client',
							});
						});
						/**
						 * All other multi-client tests begin with a `null` value to the field that is being
						 * updated by the external client (`blogId`).
						 * This is the only scenario where providing an inital value to `blogId` will result
						 * in different behavior.
						 */
						test('fast connection speed, low latency where second field is created with initial value', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';

							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'original blogId',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs([
									'title',
									'blogId',
									'_version' ?? null,
								])
							).toEqual([
								['original title', 'original blogId', 1],
								['post title 0', 'original blogId', 1],
								['post title 1', 'original blogId', 1],
								['post title 2', 'original blogId', 1],
								['post title 0', 'original blogId', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 0',
								blogId: 'original blogId',
							});
						});
						test('slow connection speed, high latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'high';
							harness.settleOutboxAfterRevisions = true;

							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: undefined,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 0', null, 2],
								['post title 1', null, 2],
								['post title 1', null, 3],
								['post title 1', 'update from second client', 4],
								['post title 2', 'update from second client', 4],
								['post title 2', 'update from second client', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
								blogId: 'update from second client',
							});
						});
						test('slow connection speed, low latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'low';
							harness.settleOutboxAfterRevisions = true;
							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 3,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 0', null, 2],
								['post title 1', null, 2],
								['post title 1', null, 3],
								['post title 1', 'update from second client', 4],
								['post title 2', 'update from second client', 4],
								['post title 2', 'update from second client', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
								blogId: 'update from second client',
							});
						});
					});
				});
			});
		});
	});

	describe('OptimisticConcurrency conflict resolution', () => {
		beforeEach(async () => {
			harness = new UpdateSequenceHarness('OptimisticConcurrency');
			await harness.startDatastore();
		});

		afterEach(async () => {
			await harness.destroy();
		});
		describe('connection state change handling', () => {
			beforeEach(async () => {
				warpTime();
			});

			afterEach(async () => {
				unwarpTime();
			});

			describe('observed rapid single-field mutations with variable connection latencies 123', () => {
				describe('single client updates', () => {
					test('slow connection speed, high latency where we wait for the create to clear the outbox', async () => {
						/**
						 * Slow connection speed is simulated by running datastore commands as quickly as possible,
						 * leaving little time for internal resolution before the next command runs.
						 */
						harness.connectionSpeed = 'slow';
						/**
						 * High latency is simulated by adding time around graphql calls and before subscriptions
						 * are updated to demonstrate behavior when the datastore updates locally, but is latent
						 * syncing out to graphql.
						 */
						harness.latency = 'high';
						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(2);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 1', 1],
							['post title 2', 1],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 2,
							title: 'post title 0',
						});
					});
					test('fast connection speed, low latency where we wait for the create to clear the outbox', async () => {
						/**
						 * Fast connection speed is simulated by running datastore commands as discretely as
						 * possible, waiting 200ms between each command for internal resolution before the next command runs.
						 */
						harness.connectionSpeed = 'fast';
						/**
						 * Low latency is simulated by keeping very little time around graphql calls and before
						 * subscriptions are updated to demonstrate behavior when the datastore updates locally,
						 * and is quickly syncing out to graphql.
						 */
						harness.latency = 'low';
						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						// Note: We do NOT wait for the outbox to be empty here, because
						// we want to test concurrent updates being processed by the outbox.
						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(3);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 1', 1],
							['post title 2', 1],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 2,
							title: 'post title 0',
						});
					});
					test('slow connection speed, high latency where we DO NOT wait for the create to clear the outbox', async () => {
						harness.connectionSpeed = 'slow';
						harness.latency = 'high';

						// Note: We do NOT wait for the outbox to be empty here, because
						// we want to test concurrent updates being processed by the outbox.
						const postHarness = await harness.createPostHarness(
							{
								title: 'original title',
								blogId: 'blog id',
							},
							false
						);

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(0);

						expect(harness.subscriptionLogs()).toEqual([
							['post title 0', undefined],
							['post title 1', undefined],
							['post title 2', undefined],
							['post title 2', 1],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 1,
							title: 'post title 2',
						});
					});
					test('fast connection speed, low latency where we DO NOT wait for the create to clear the outbox', async () => {
						harness.connectionSpeed = 'fast';
						harness.latency = 'low';

						// Note: We do NOT wait for the outbox to be empty here, because
						// we want to test concurrent updates being processed by the outbox.
						const postHarness = await harness.createPostHarness(
							{
								title: 'original title',
								blogId: 'blog id',
							},
							false
						);

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.outboxSettled();
						await harness.expectUpdateCallCount(0);

						expect(harness.subscriptionLogs()).toEqual([
							['post title 0', undefined],
							['post title 1', undefined],
							['post title 2', undefined],
							['post title 2', 1],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 1,
							title: 'post title 2',
						});
					});
					test('slow connection speed, high latency where we wait for all mutations to clear the outbox', async () => {
						harness.connectionSpeed = 'slow';
						harness.latency = 'high';
						/**
						 * We wait for the empty outbox on each mutation, because
						 * we want to test non-concurrent updates (i.e. we want to make
						 * sure all the updates are going out and are being observed)
						 */
						harness.settleOutboxAfterRevisions = true;

						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.expectUpdateCallCount(3);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 0', 2],
							['post title 1', 2],
							['post title 1', 3],
							['post title 2', 3],
							['post title 2', 4],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 4,
							title: 'post title 2',
						});
					});
					test('slow connection speed, low latency where we wait for all mutations to clear the outbox', async () => {
						harness.connectionSpeed = 'slow';
						harness.latency = 'low';
						harness.settleOutboxAfterRevisions = true;
						const postHarness = await harness.createPostHarness({
							title: 'original title',
							blogId: 'blog id',
						});

						await postHarness.revise('post title 0');
						await postHarness.revise('post title 1');
						await postHarness.revise('post title 2');

						await harness.expectUpdateCallCount(3);

						expect(harness.subscriptionLogs()).toEqual([
							['original title', 1],
							['post title 0', 1],
							['post title 0', 2],
							['post title 1', 2],
							['post title 1', 3],
							['post title 2', 3],
							['post title 2', 4],
						]);

						expect(await postHarness.currentContents).toMatchObject({
							_version: 4,
							title: 'post title 2',
						});
					});
				});

				/**
				 * The following multi-client tests are almost identical to the single-client tests above:
				 * as a result, the comments in these tests relate specifically to multi-client operations only.
				 * The primary differences are that we inject external client updates, and add many permutations
				 * on essentially the same patterns. For a complete understanding of how these tests work (why /
				 * when we await the outbox, pause, wait for the service to settle, etc), refer to the
				 * single-field tests.
				 */
				describe('Multi-client updates', () => {
					describe('Updates to the same field', () => {
						test('slow connection speed, high latency where we wait for the create to clear the outbox', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'high';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');
							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 1,
							});
							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(3);
							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 1', 1],
								['post title 2', 1],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 2,
								title: 'update from second client',
							});
						});
						test('fast connection speed, low latency where we wait for the create to clear the outbox', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');
							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 1,
							});
							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 1', 1],
								['post title 2', 1],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 2,
								title: 'post title 0',
							});
						});
						test('fast connection speed, high latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'high';
							harness.settleOutboxAfterRevisions = true;
							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 3,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 0', 2],
								['post title 1', 2],
								['post title 1', 3],
								['update from second client', 4],
								['post title 2', 4],
								['post title 2', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
							});
						});
						test('fast connection speed, low latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';
							harness.settleOutboxAfterRevisions = true;

							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'blog id',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								updatedFields: { title: 'update from second client' },
								version: 3,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(harness.subscriptionLogs()).toEqual([
								['original title', 1],
								['post title 0', 1],
								['post title 0', 2],
								['post title 1', 2],
								['post title 1', 3],
								['update from second client', 4],
								['post title 2', 4],
								['post title 2', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
							});
						});
					});

					/**
					 * NOTE: Even though the primary client is updating `title`,
					 * the second client's update to `blogId` "reverts" the primary
					 * client's changes. This is because the external update takes
					 * effect while the primary client's updates are still in flight.
					 * By the time the primary client's update reaches the service,
					 * the `_version` has changed. As a result, auto-merge chooses
					 * the existing server-side `title` over the proposed updated
					 * `title`. The following two tests demonstrate this behavior,
					 * with a difference in the timing of the external request,
					 * ultimately resulting in different final states.
					 */
					describe('Updates to different fields', () => {
						test('fast connection speed, high latency where external request is first received update after create', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'high';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(3);
							await pause(5000);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 1', null, 1],
								['post title 2', null, 1],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 2,
								title: 'original title',
								blogId: 'update from second client',
							});
						});
						test('slow connection speed, high latency where external request is second received update XX X', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'high';
							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							/**
							 * Ensure that the external update is received after the
							 * primary client's first update.
							 */
							await pause(3000);

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 1', null, 1],
								['post title 2', null, 1],
								['post title 2', null, 4],
							]);

							const currentPostContent = await postHarness.currentContents;
							expect(currentPostContent).toMatchObject({
								_version: 4,
								title: 'post title 2',
							});
							expect(currentPostContent?.['blogId']).toEqual(undefined);
						});
						test('fast connection speed, low latency where second field is created `null` XX X', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';

							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 1', null, 1],
								['post title 2', null, 1],
								['post title 2', null, 4],
							]);

							const currentPostContent = await postHarness.currentContents;
							expect(currentPostContent).toMatchObject({
								_version: 4,
								title: 'post title 2',
							});
							expect(currentPostContent?.['blogId']).toEqual(undefined);
						});
						/**
						 * All other multi-client tests begin with a `null` value to the field that is being
						 * updated by the external client (`blogId`).
						 * This is the only scenario where providing an inital value to `blogId` will result
						 * in different behavior.
						 */
						test('fast connection speed, low latency where second field is created with initial value', async () => {
							harness.connectionSpeed = 'fast';
							harness.latency = 'low';

							const postHarness = await harness.createPostHarness({
								title: 'original title',
								blogId: 'original blogId',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 1,
							});

							await postHarness.revise('post title 2');

							await harness.outboxSettled();
							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs([
									'title',
									'blogId',
									'_version' ?? null,
								])
							).toEqual([
								['original title', 'original blogId', 1],
								['post title 0', 'original blogId', 1],
								['post title 1', 'original blogId', 1],
								['post title 2', 'original blogId', 1],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 2,
								title: 'post title 0',
								blogId: 'original blogId',
							});
						});
						test('slow connection speed, high latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'high';
							harness.settleOutboxAfterRevisions = true;

							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 3,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 0', null, 2],
								['post title 1', null, 2],
								['post title 1', null, 3],
								['post title 1', 'update from second client', 4],
								['post title 2', 'update from second client', 4],
								['post title 2', 'update from second client', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
								blogId: 'update from second client',
							});
						});
						test('slow connection speed, low latency where we wait for all mutations to clear the outbox', async () => {
							harness.connectionSpeed = 'slow';
							harness.latency = 'low';
							harness.settleOutboxAfterRevisions = true;
							const postHarness = await harness.createPostHarness({
								title: 'original title',
							});

							await postHarness.revise('post title 0');
							await postHarness.revise('post title 1');

							await harness.externalPostUpdate({
								originalPostId: postHarness.original.id,
								// External client performs a mutation against a different field:
								updatedFields: { blogId: 'update from second client' },
								version: 3,
							});

							await postHarness.revise('post title 2');

							await harness.expectUpdateCallCount(4);

							expect(
								harness.subscriptionLogs(['title', 'blogId', '_version'])
							).toEqual([
								['original title', null, 1],
								['post title 0', null, 1],
								['post title 0', null, 2],
								['post title 1', null, 2],
								['post title 1', null, 3],
								['post title 1', 'update from second client', 4],
								['post title 2', 'update from second client', 4],
								['post title 2', 'update from second client', 5],
							]);

							expect(await postHarness.currentContents).toMatchObject({
								_version: 5,
								title: 'post title 2',
								blogId: 'update from second client',
							});
						});
					});
				});
			});
		});
	});
});
