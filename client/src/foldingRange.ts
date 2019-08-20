/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { languages as Languages, Disposable, TextDocument, ProviderResult, FoldingRangeKind as VFoldingRangeKind, FoldingRange as VFoldingRange, FoldingContext } from 'vscode';

import {
	ClientCapabilities, CancellationToken, ServerCapabilities, DocumentSelector, FoldingRange, FoldingRangeKind, FoldingRangeRequest, FoldingRangeParams
} from 'vscode-languageserver-protocol';

import { TextDocumentFeature, BaseLanguageClient } from './client';
import { FoldingRangeRegistrationOptions, FoldingRangeOptions } from 'vscode-languageserver-protocol/lib/protocol.foldingRange';

function ensure<T, K extends keyof T>(target: T, key: K): T[K] {
	if (target[key] === void 0) {
		target[key] = {} as any;
	}
	return target[key];
}

export interface ProvideFoldingRangeSignature {
	(document: TextDocument, context: FoldingContext, token: CancellationToken): ProviderResult<VFoldingRange[]>;
}


export interface FoldingRangeProviderMiddleware {
	provideFoldingRanges?: (this: void, document: TextDocument, context: FoldingContext, token: CancellationToken, next: ProvideFoldingRangeSignature) => ProviderResult<VFoldingRange[]>;
}

export class FoldingRangeFeature extends TextDocumentFeature<boolean | FoldingRangeOptions, FoldingRangeRegistrationOptions> {

	constructor(client: BaseLanguageClient) {
		super(client, FoldingRangeRequest.type);
	}

	public fillClientCapabilities(capabilites: ClientCapabilities): void {
		let capability = ensure(ensure(capabilites, 'textDocument')!, 'foldingRange')!;
		capability.dynamicRegistration = true;
		capability.rangeLimit = 5000;
		capability.lineFoldingOnly = true;
	}

	public initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
		let [id, options] = this.getRegistration(documentSelector, capabilities.foldingRangeProvider);
		if (!id || !options) {
			return;
		}
		this.register(this.messages, { id: id, registerOptions: options });
	}

	protected registerLanguageProvider(options: FoldingRangeRegistrationOptions): Disposable {
		let client = this._client;
		let provideFoldingRanges: ProvideFoldingRangeSignature = (document, _, token) => {
			const requestParams: FoldingRangeParams = {
				textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document)
			};
			return client.sendRequest(FoldingRangeRequest.type, requestParams, token).then(
				this.asFoldingRanges.bind(this),
				(error: any) => {
					client.logFailedRequest(FoldingRangeRequest.type, error);
					return Promise.resolve(null);
				}
			);
		};
		let middleware = client.clientOptions.middleware!;
		return Languages.registerFoldingRangeProvider(options.documentSelector!, {

			provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken) {
				return middleware.provideFoldingRanges
					? middleware.provideFoldingRanges(document, context, token, provideFoldingRanges)
					: provideFoldingRanges(document, context, token);
			}
		});
	}

	private asFoldingRangeKind(kind: string | undefined): VFoldingRangeKind | undefined {
		if (kind) {
			switch (kind) {
				case FoldingRangeKind.Comment:
					return VFoldingRangeKind.Comment;
				case FoldingRangeKind.Imports:
					return VFoldingRangeKind.Imports;
				case FoldingRangeKind.Region:
					return VFoldingRangeKind.Region;
			}
		}
		return void 0;
	}

	private asFoldingRanges(foldingRanges: FoldingRange[]): VFoldingRange[] {
		if (Array.isArray(foldingRanges)) {
			return foldingRanges.map(r => {
				return new VFoldingRange(r.startLine, r.endLine, this.asFoldingRangeKind(r.kind));
			});
		}
		return [];
	}
}