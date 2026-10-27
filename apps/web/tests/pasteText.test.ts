import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePastedLines, normalizeBullets, pastedTextToHtml, escapeHtml } from '../src/lib/pasteText.ts';

test('quita viñetas de Word, guiones y numeración', () => {
  const r = parsePastedLines('• Cena de tres pasos\n·  Show en vivo\n- Bebidas\n– Traslado\n* Postre\n1. Entrada\n2) Principal');
  assert.deepEqual(r.lines, ['Cena de tres pasos', 'Show en vivo', 'Bebidas', 'Traslado', 'Postre', 'Entrada', 'Principal']);
  assert.equal(r.hadMarkers, true);
});

test('viñetas Wingdings/Symbol de Word (uso privado)', () => {
  assert.deepEqual(parsePastedLines('\tCena\n Show').lines, ['Cena', 'Show']);
});

test('no se come guiones ni asteriscos pegados al texto', () => {
  const r = parsePastedLines('-5% de descuento\n*Sujeto a disponibilidad');
  assert.deepEqual(r.lines, ['-5% de descuento', '*Sujeto a disponibilidad']);
  assert.equal(r.hadMarkers, false);
});

test('descarta líneas vacías, normaliza saltos CRLF y espacios no separables', () => {
  assert.deepEqual(parsePastedLines('uno\r\n\r\n \r\n  dos  \r\ntres').lines, ['uno', 'dos', 'tres']);
});

test('prefijos apilados y texto sin marcadores', () => {
  assert.deepEqual(parsePastedLines('• - Cena').lines, ['Cena']);
  const r = parsePastedLines('Solo texto');
  assert.deepEqual(r.lines, ['Solo texto']);
  assert.equal(r.hadMarkers, false);
});

test('entrada vacía', () => {
  assert.deepEqual(parsePastedLines('  \n\n').lines, []);
  assert.equal(pastedTextToHtml('  '), null);
});

test('normalizeBullets unifica viñetas a "• " y conserva párrafos y numeración', () => {
  assert.equal(
    normalizeBullets('Intro  \n\n- uno\n·dos\n–  tres\n1. no se toca'),
    'Intro\n\n• uno\n• dos\n• tres\n1. no se toca',
  );
});

test('pastedTextToHtml: lista, párrafos o texto plano', () => {
  assert.equal(pastedTextToHtml('• a\n• b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(pastedTextToHtml('ENTRADA\nEmpanada'), '<p>ENTRADA</p><p>Empanada</p>');
  assert.equal(pastedTextToHtml('una sola línea'), null);
});

test('pastedTextToHtml escapa HTML', () => {
  assert.equal(pastedTextToHtml('• <b>x</b> & y\n• z'), '<ul><li>&lt;b&gt;x&lt;/b&gt; &amp; y</li><li>z</li></ul>');
  assert.equal(escapeHtml('a<b>&'), 'a&lt;b&gt;&amp;');
});
