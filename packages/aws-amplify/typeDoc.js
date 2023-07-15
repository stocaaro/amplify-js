// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
module.exports = {
	readme: '../../README.md',
	media: '../../media',
	exclude: '**/*+(InMemoryCache|ErrorUtils|CacheUtils|cacheList|index).ts',
	excludeExternals: true,
	excludeNotExported: true,
	excludePrivate: true,
};
