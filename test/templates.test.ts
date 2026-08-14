import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, parseFields, renderRouteList } from '../src/lib/templates';
import { scanSource } from '../src/lib/arkts-check';

test('page 模板包含 @Entry/@Component/struct 名且无 any', () => {
  const r = renderTemplate('page', { name: 'LoginPage' });
  assert.equal(r.fileName, 'LoginPage.ets');
  assert.match(r.code, /@Entry/);
  assert.match(r.code, /@Component/);
  assert.match(r.code, /struct LoginPage/);
  assert.match(r.code, /@State message: string/);
  const findings = scanSource('gen.ets', r.code);
  assert.ok(!findings.some((f) => f.rule === 'noAny'), '模板不应包含 any/unknown');
});

test('component 模板包含 @Prop/@State 与导出 struct', () => {
  const r = renderTemplate('component', { name: 'UserCard' });
  assert.match(r.code, /export struct UserCard/);
  assert.match(r.code, /@Prop title: string/);
  assert.match(r.code, /@State count: number/);
});

test('model 模板 interface/class 风格与字段', () => {
  const fields = parseFields('id:number,name:string,isVip:boolean');
  assert.deepEqual(fields, [
    { name: 'id', type: 'number' },
    { name: 'name', type: 'string' },
    { name: 'isVip', type: 'boolean' },
  ]);
  const iface = renderTemplate('model', { name: 'User', fields });
  assert.match(iface.code, /export interface User/);
  assert.match(iface.code, /id: number/);
  const cls = renderTemplate('model', { name: 'User', fields, style: 'class' });
  assert.match(cls.code, /export class User/);
  assert.match(cls.code, /id: number = 0;/);
  assert.match(cls.code, /name: string = '';/);
  assert.match(cls.code, /isVip: boolean = false;/);
});

test('model 无字段时报错', () => {
  assert.throws(() => renderTemplate('model', { name: 'User', fields: [] }), /--fields/);
});

test('state 模板生成 @Observed 类且字段有初值', () => {
  const r = renderTemplate('state', { name: 'CartState', fields: parseFields('items:number,totalPrice:number') });
  assert.match(r.code, /@Observed/);
  assert.match(r.code, /export class CartState/);
  assert.match(r.code, /items: number = 0;/);
});

test('route-list 扫描 @Entry 页面生成常量表', () => {
  const files: Record<string, string> = {
    'LoginPage.ets': '@Entry\n@Component\nstruct LoginPage {\n  build() {}\n}',
    'HomePage.ets': '@Entry\n@Component\nstruct HomePage {\n  build() {}\n}',
    'sub/NotPage.ets': '@Component\nstruct Widget {\n  build() {}\n}',
  };
  const r = renderRouteList(
    'pages',
    (p) => files[p],
    () => Object.keys(files)
  );
  assert.equal(r.fileName, 'RouteConstants.ets');
  assert.match(r.code, /static readonly HomePage = '\/HomePage';/);
  assert.match(r.code, /static readonly LoginPage = '\/LoginPage';/);
  assert.ok(!r.code.includes('NotPage'), '无 @Entry 的组件不应进路由表');
});

test('parseFields 缺类型时默认 string', () => {
  assert.deepEqual(parseFields('a,b:number'), [
    { name: 'a', type: 'string' },
    { name: 'b', type: 'number' },
  ]);
});

test('route-list 重复 struct 名去重并警告', () => {
  const files: Record<string, string> = {
    'a/HomePage.ets': '@Entry\n@Component\nstruct HomePage {\n  build() {}\n}',
    'b/HomePage.ets': '@Entry\n@Component\nstruct HomePage {\n  build() {}\n}',
    'LoginPage.ets': '@Entry\n@Component\nstruct LoginPage {\n  build() {}\n}',
  };
  const r = renderRouteList('pages', (p) => files[p], () => Object.keys(files));
  assert.ok(r.warnings && r.warnings.some((w) => w.includes('HomePage')));
  assert.equal((r.code.match(/static readonly HomePage/g) || []).length, 1);
  assert.match(r.code, /static readonly LoginPage/);
});

test('非法类型名/字段名报错', () => {
  assert.throws(() => renderTemplate('page', { name: '123' }), /合法标识符/);
  assert.throws(() => renderTemplate('model', { name: 'User', fields: parseFields('first name:string') }), /合法标识符/);
});

