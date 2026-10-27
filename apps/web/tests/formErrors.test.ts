import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeApiError, translateZodMessage, validateIncludes, validateMaxLength } from '../src/lib/formErrors.ts';

test('traduce los mensajes comunes de zod', () => {
  assert.equal(translateZodMessage('String must contain at most 300 character(s)'), 'máximo 300 caracteres');
  assert.equal(translateZodMessage('String must contain at least 1 character(s)'), 'es obligatorio');
  assert.equal(translateZodMessage('Array must contain at most 30 element(s)'), 'máximo 30 ítems');
  assert.equal(translateZodMessage('Number must be greater than or equal to 0'), 'no puede ser negativo');
  assert.equal(translateZodMessage('Required'), 'es obligatorio');
  assert.equal(translateZodMessage('Invalid url'), 'no es una URL válida');
  assert.equal(translateZodMessage('algo raro'), 'algo raro');
});

test('describeApiError con details en forma flatten()', () => {
  const msgs = describeApiError({
    message: 'Invalid input',
    details: {
      formErrors: [],
      fieldErrors: {
        includes_es: ['String must contain at most 300 character(s)'],
        name_es: ['Required'],
      },
    },
  });
  assert.deepEqual(msgs, ['Incluye: máximo 300 caracteres', 'Nombre: es obligatorio']);
});

test('describeApiError con issues indica el número de ítem', () => {
  const msgs = describeApiError({
    message: 'Invalid input',
    details: { issues: [{ path: ['includes_es', 2], message: 'String must contain at most 300 character(s)' }] },
  });
  assert.deepEqual(msgs, ['Incluye, ítem 3: máximo 300 caracteres']);
});

test('describeApiError sin details devuelve el mensaje; "Invalid input" pelado se explica', () => {
  assert.deepEqual(describeApiError({ message: 'Sin conexión con el servidor: x' }), ['Sin conexión con el servidor: x']);
  assert.match(describeApiError({ message: 'Invalid input' })[0], /revisá los campos/i);
  assert.deepEqual(describeApiError({ message: 'No se puede borrar', details: { order_count: 3 } }), ['No se puede borrar']);
});

test('validateIncludes: límite por ítem y total', () => {
  assert.deepEqual(validateIncludes(['ok', 'x'.repeat(301)]), ['Incluye, ítem 2: máximo 300 caracteres (tiene 301)']);
  assert.deepEqual(validateIncludes(['x'.repeat(300)]), []);
  assert.deepEqual(validateIncludes(Array(31).fill('a')), ['Incluye: máximo 30 ítems (tiene 31)']);
});

test('validateMaxLength', () => {
  assert.deepEqual(validateMaxLength('Descripción corta', 'a'.repeat(501), 500), ['Descripción corta: máximo 500 caracteres (tiene 501)']);
  assert.deepEqual(validateMaxLength('X', null, 5), []);
});

import { validateOptionDraft, validateMenuDraft } from '../src/lib/formErrors.ts';

test('validateOptionDraft: código, nombre, descripción e Incluye', () => {
  assert.deepEqual(validateOptionDraft({ code: 'cena-show', name_es: 'Cena', includes_es: ['a'] }), []);
  const errs = validateOptionDraft({
    code: 'Cena Show', name_es: ' ', description_es: 'x'.repeat(501), includes_es: ['y'.repeat(301)],
  });
  assert.equal(errs.length, 4);
  assert.match(errs[0], /^Código interno:/);
  assert.equal(errs[1], 'Nombre: es obligatorio');
  assert.equal(errs[2], 'Descripción: máximo 500 caracteres (tiene 501)');
  assert.equal(errs[3], 'Incluye, ítem 1: máximo 300 caracteres (tiene 301)');
});

test('validateMenuDraft', () => {
  assert.deepEqual(validateMenuDraft({ title: 'ok', content_html: '<p>x</p>' }), []);
  assert.deepEqual(validateMenuDraft({ title: '', content_html: 'x'.repeat(20001) }), ['Menú: máximo 20000 caracteres (tiene 20001)']);
});
