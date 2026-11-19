import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { compressPermitImagesForPdf } from './image.ts';

test('PDF image preparation processes two unique sources at a time and preserves fallbacks', async () => {
    const originalImage = globalThis.Image;
    const originalDocument = globalThis.document;
    let active = 0;
    let maxActive = 0;
    const loads = [];
    globalThis.Image = class {
        naturalWidth = 1600;
        naturalHeight = 800;
        set src(value) {
            this.source = value;
            loads.push(value);
            active++;
            maxActive = Math.max(maxActive, active);
            setTimeout(() => {
                active--;
                if (value === 'broken') this.onerror();
                else this.onload();
            }, 10);
        }
    };
    globalThis.document = {
        createElement() {
            let source;
            return {
                getContext: () => ({ fillRect() {}, drawImage(image) { source = image.source; } }),
                toDataURL: () => `compressed:${source}`
            };
        }
    };
    try {
        const permit = {
            photos: [{ url: 'one' }, { url: 'two' }, { url: 'one' }, { url: 'broken' }],
            approverPhoto: 'two',
            dailySignOffUrl: 'three',
            crewRegistrationUrl: 'three'
        };
        const result = await compressPermitImagesForPdf(permit);
        assert.equal(maxActive, 2);
        assert.deepEqual(loads, ['one', 'two', 'broken', 'three']);
        assert.deepEqual(result.photos.map(photo => photo.url), ['compressed:one', 'compressed:two', 'compressed:one', 'broken']);
        assert.equal(result.approverPhoto, 'compressed:two');
        assert.equal(result.dailySignOffUrl, 'compressed:three');
        assert.equal(result.crewRegistrationUrl, 'compressed:three');
        assert.equal(permit.photos[0].url, 'one');
    } finally {
        globalThis.Image = originalImage;
        globalThis.document = originalDocument;
    }
});

test('PDF includes continuation entries, signer names and crew timestamps', () => {
    const require = createRequire(import.meta.url);
    const result = buildSync({
        stdin: {
            contents: `
                import React from 'react';
                import { renderToStaticMarkup } from 'react-dom/server';
                import PermitPDFLayout from './components/PermitPDFLayout';
                module.exports = permit => renderToStaticMarkup(React.createElement(PermitPDFLayout, {
                    permit, pdfRef: { current: null }, currentReceiverName: '', currentHandovers: [],
                    partAItems: [], partBItems: [], receiverItems: [], handoverItems: [], CEASE_WORKS_ITEMS: []
                }));
            `,
            resolveDir: process.cwd(),
            loader: 'js'
        },
        bundle: true, platform: 'node', format: 'cjs', write: false,
        external: ['react', 'react-dom', 'react-dom/server']
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
    const signature = name => ({ name, data: name, type: 'type', date: new Date(2026, 2, 4, 9, 7).toISOString() });
    const dailyLogs = Array.from({ length: 14 }, (_, index) => ({
        id: `daily-${index}`, date: new Date(2026, 2, 4, 9, 7).toISOString(),
        receiverSig: signature(`Receiver ${index}`), excavatorSig: signature(`Operator ${index}`), spotterSig: signature(`Spotter ${index}`)
    }));
    const crewMembers = Array.from({ length: 33 }, (_, index) => ({
        id: `crew-${index}`, name: `Crew ${index}`, dateInducted: new Date(2026, 2, 4, 9, 7).toISOString(), signature: signature(`Crew ${index}`)
    }));
    const html = module.exports({ dailyLogs, crewMembers, photos: [], partACloseApproach: {} });
    for (const index of [0, 4, 5, 12, 13]) {
        assert.ok(html.includes(`Receiver ${index}`));
        assert.ok(html.includes(`Operator ${index}`));
        assert.ok(html.includes(`Spotter ${index}`));
    }
    for (const index of [0, 15, 16, 31, 32]) assert.ok(html.includes(`Crew ${index}`));
    assert.ok(html.includes('04/03/2026 09:07'));
    assert.ok(html.includes('Daily Sign On (continued)'));
    assert.ok(html.includes('Crew Registration (continued)'));
});
