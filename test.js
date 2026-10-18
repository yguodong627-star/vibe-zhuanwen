// 自测：node test.js （需要 puppeteer-core 与本机 Chrome）
const puppeteer = require('/workspace/tools/node_modules/puppeteer-core');
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : (fail++, console.log('✗', name, '\n   got :', JSON.stringify(got), '\n   want:', JSON.stringify(want))); if (ok) console.log('✓', name); };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  const pg = await b.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const reqs = []; pg.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) reqs.push(r.url()); });
  await pg.goto('file://' + __dirname + '/index.html');
  await pg.evaluate(() => localStorage.clear()); await pg.reload();
  const R = (id, text, p) => pg.evaluate((id, text, p) => { const r = ZW.RULES.find(x => x.id === id); return r.fn(text, Object.assign(Object.fromEntries(r.params.map(q => [q.k, q.def])), p || {})); }, id, text, p);

  eq('去首尾空格', await R('trim', '  a b \u3000\n\tc  '), 'a b\nc');
  eq('合并连续空格', await R('collapse', 'a   b\t\tc d'), 'a b c d');
  eq('去空行-全部', await R('blank', 'a\n\n  \nb\n'), 'a\nb');
  eq('去空行-合并', await R('blank', 'a\n\n\n\nb\n\nc', { mode: 'merge' }), 'a\n\nb\n\nc');
  eq('去重行', await R('dedupe', 'a\nb\na\n b\nc'), 'a\nb\nc');
  eq('去重行-忽略大小写', await R('dedupe', 'Ab\nab\nAB', { ic: true }), 'Ab');
  eq('去重行-区分大小写', await R('dedupe', 'Ab\nab', { ic: false }), 'Ab\nab');
  eq('全角→半角 字母数字', await R('width', 'ＡＢｃ１２３，。'), 'ABc123，。');
  eq('全角→半角 含标点', await R('width', 'ＡＢ，！（ｘ）\u3000y', { mode: 'f2h-all' }), 'AB,!(x) y');
  eq('半角→全角 字母数字', await R('width', 'Ab12,x', { mode: 'h2f-alnum' }), 'Ａｂ１２,ｘ');
  eq('半角→全角 含标点', await R('width', 'a,1!', { mode: 'h2f-all' }), 'ａ，１！');
  eq('中英文加空格', await R('cjkspace', '我用iPhone15拍照，共3张'), '我用 iPhone15 拍照，共 3 张');
  eq('中英文去空格', await R('cjkspace', '我用 iPhone 拍照 3 张', { mode: 'remove' }), '我用iPhone拍照3张');
  eq('统一标点→中文', await R('punct', '你好,世界. hello (测试) "引用" 现在12:30 完成!下一步...'), '你好，世界。 hello （测试） “引用” 现在12:30 完成！下一步……');
  eq('统一标点→中文 不动英文/小数/网址', await R('punct', 'Hello, world. v1.2 a.com 中文.com'), 'Hello, world. v1.2 a.com 中文.com');
  eq('统一标点→英文', await R('punct', '你好，世界。（测试）“引”；好：吗？是！……', { mode: 'toEN' }), '你好,世界.(测试)"引";好:吗?是!...');
  eq('提取邮箱', await R('extract', 'a: Foo.Bar@ex.com, x@y.org; foo.bar@ex.com 非邮箱@ 123', { type: 'email' }), 'Foo.Bar@ex.com\nx@y.org\nfoo.bar@ex.com');
  eq('提取邮箱-不去重', await R('extract', 'a@b.co a@b.co', { type: 'email', uniq: false }), 'a@b.co\na@b.co');
  eq('提取链接', await R('extract', '见 https://a.com/x?y=1。再看(http://b.org/p), www.c.cn.', { type: 'url' }), 'https://a.com/x?y=1\nhttp://b.org/p\nwww.c.cn');
  eq('提取手机号', await R('extract', '138-1234-5678，+86 139 0000 1111 或13700001111，12345678901 不算 213812345678', { type: 'phone' }), '13812345678\n13900001111\n13700001111');
  eq('排序-升序(拼音)', await R('sort', '王\n张\n李\nb\na\n10\n9'), '9\n10\na\nb\n李\n王\n张');
  eq('排序-降序', await R('sort', 'a\nc\nb', { mode: 'desc' }), 'c\nb\na');
  eq('排序-长度', await R('sort', 'ccc\na\nbb', { mode: 'len' }), 'a\nbb\nccc');
  eq('排序-数字', await R('sort', 'x 10\ny 2\nz\nw 1,000\nq -3', { mode: 'num' }), 'q -3\ny 2\nx 10\nw 1,000\nz');
  eq('排序-倒序', await R('sort', '1\n2\n3', { mode: 'rev' }), '3\n2\n1');
  eq('排序-随机(同元素)', (await R('sort', '1\n2\n3\n4\n5\n6', { mode: 'rand' })).split('\n').sort(), ['1', '2', '3', '4', '5', '6']);
  eq('拆列-多列', await R('split', 'a, b ,c\nd,e', { sep: ',' }), 'a\tb\tc\nd\te');
  eq('拆列-取第2列', await R('split', 'a|b|c\nx|y', { sep: '|', mode: 'pick', n: 2 }), 'b\ny');
  eq('拆列-多行', await R('split', 'a;b\n;c;', { sep: ';', mode: 'rows' }), 'a\nb\nc');
  eq('拆列-Tab分隔符', await R('split', 'a\tb', { sep: '\\t', mode: 'pick', n: 2 }), 'b');
  eq('拆列-正则', await R('split', 'a  b   c', { sep: '\\s+', re: true }), 'a\tb\tc');
  eq('替换-普通(含特殊字符)', await R('replace', 'a.b a.b (x)', { pairs: 'a.b => Z\n(x) => [y]' }), 'Z Z [y]');
  eq('替换-正则分组', await R('replace', '2026-10-18', { pairs: '(\\d+)-(\\d+)-(\\d+) => $1年$2月$3日', re: true }), '2026年10月18日');
  eq('替换-正则行尾空白+换行符', await R('replace', 'a  \nb\t', { pairs: '[ \\t]+$ => ', re: true }), 'a\nb');
  eq('替换-忽略大小写', await R('replace', 'Foo foo FOO', { pairs: 'foo => x', ic: true }), 'x x x');
  eq('替换-顺序执行', await R('replace', 'a', { pairs: 'a => b\nb => c' }), 'c');
  eq('替换-错误行', await pg.evaluate(() => ZW.runChain('a', [{ id: 'replace', on: true, p: { pairs: 'abc' } }]).info[0].err), '第 1 行缺少 =>');
  eq('替换-坏正则不崩', await pg.evaluate(() => !!ZW.runChain('a', [{ id: 'replace', on: true, p: { pairs: '( => x', re: true } }]).info[0].err), true);
  eq('规则链顺序执行', await pg.evaluate(() => ZW.runChain(' b\na\n\n a ', ZW.stepsFromPreset([['trim'], ['blank'], ['dedupe'], ['sort']])).out), 'a\nb');

  // 互转
  const C = (t, i, o, opt) => pg.evaluate((t, i, o, opt) => ZW.convert(t, i, o, Object.assign({ head: true, infer: true, delim: 'auto' }, opt)).text, t, i, o, opt);
  const csv = '姓名,城市,年龄,备注\n张三,上海,28,"喜欢咖啡, 也喜欢茶"\n李四,北京,35,\n王五,成都,041,"说过""你好"""';
  const js = JSON.parse(await C(csv, 'csv', 'json'));
  eq('CSV→JSON 条数', js.length, 3);
  eq('CSV→JSON 带逗号/引号/数字', [js[0].备注, js[2].备注, js[0].年龄, js[1].备注], ['喜欢咖啡, 也喜欢茶', '说过"你好"', 28, '']);
  eq('CSV→JSON 前导零保留字符串', js[2].年龄, '041');
  eq('CSV→JSON 不识别数字', JSON.parse(await C(csv, 'csv', 'json', { infer: false }))[0].年龄, '28');
  const back = await C(JSON.stringify(js), 'json', 'csv');
  eq('JSON→CSV 往返一致', back, csv);
  const md = await C(csv, 'csv', 'md');
  console.log(md);
  eq('CSV→MD 结构', md.split('\n').length, 5);
  eq('MD→CSV 往返一致', await C(md, 'md', 'csv'), csv);
  eq('MD→JSON 等同', JSON.parse(await C(md, 'md', 'json')), js);
  eq('TSV 粘贴→JSON', JSON.parse(await C('a\tb\n1\t2', 'auto', 'json')), [{ a: 1, b: 2 }]);
  eq('分号CSV自动识别', JSON.parse(await C('a;b\n1;2', 'auto', 'json')), [{ a: 1, b: 2 }]);
  eq('无表头→列1', JSON.parse(await C('1,2\n3,4', 'csv', 'json', { head: false })), [{ 列1: 1, 列2: 2 }, { 列1: 3, 列2: 4 }]);
  eq('二维数组', JSON.parse(await C('a,b\n1,2', 'csv', 'jsonarr')), [['a', 'b'], [1, 2]]);
  eq('嵌套JSON拍平+缺失键', await C('[{"a":{"b":1},"c":[1,2]},{"a":{"b":2},"d":true}]', 'json', 'csv'), 'a.b,c,d\n1,"[1,2]",\n2,,true');
  eq('JSON 二维数组→CSV', await C('[[1,"x,y"],[2,"z"]]', 'json', 'csv', { head: false }), '1,"x,y"\n2,z');
  eq('单个对象→CSV', await C('{"a":1,"b":"x"}', 'json', 'csv'), 'a,b\n1,x');
  eq('CSV 内换行', JSON.parse(await C('a,b\n"x\ny",2', 'csv', 'json'))[0].a, 'x\ny');
  eq('MD 转义竖线', await C('a,b\n"x|y",2', 'csv', 'md'), '| a    | b   |\n| ---- | --- |\n| x\\|y | 2   |');
  eq('CSV→TSV', await C('a,b\n"x,y",2', 'csv', 'tsv'), 'a\tb\nx,y\t2');
  eq('坏JSON报错', await pg.evaluate(() => { try { ZW.convert('{bad', 'json', 'csv', { head: true, infer: true, delim: 'auto' }); } catch (e) { return e.message.slice(0, 9); } }), 'JSON 解析失败');
  eq('引号未闭合报错', await pg.evaluate(() => { try { ZW.convert('a,"b', 'csv', 'json', { head: true, infer: true, delim: 'auto' }); } catch (e) { return e.message; } }), '引号没有闭合');
  eq('Markdown 中文列对齐', (await C('名,值\n张三,1', 'csv', 'md')).split('\n')[1], '| ---- | --- |');

  // diff
  const d = await pg.evaluate(() => ZW.diffLines(['a', 'b', 'c', 'd'], ['a', 'c', 'x', 'd']).ops.map(o => o.join(':')));
  eq('diff 行级', d, ['eq:a', 'del:b', 'eq:c', 'add:x', 'eq:d'].sort((x, y) => 0) && ['eq:a', 'del:b', 'eq:c', 'del:d', 'add:x', 'eq:d'].filter(x => x !== 'del:d'));

  // UI
  await pg.click('#btnSample');
  await new Promise(r => setTimeout(r, 300));
  const out1 = await pg.$eval('#out', e => e.value);
  eq('UI 默认预设：去重生效(重复行消失)', out1.split('\n').filter(l => l.startsWith('张三')).length, 1);
  eq('UI 无空行', out1.includes('\n\n'), false);
  await pg.click('[data-view=diff]');
  eq('UI 差异含删除行', (await pg.$$('#diff .dl.del')).length > 0, true);
  eq('UI 差异统计', /删 \d+ 行/.test(await pg.$eval('#outStat', e => e.textContent)), true);
  await pg.click('[data-view=out]');
  // 启用提取
  await pg.click('#presets .chip[data-i="2"]');
  await new Promise(r => setTimeout(r, 300));
  eq('UI 预设-提取邮箱', await pg.$eval('#out', e => e.value), 'li.si@example.org'.replace('li.si', 'Li.Si').split('\n').length && 'Li.Si@Example.org\nzhangsan@example.com');
  // 保存规则链 3 条上限
  const save = async n => { await pg.$eval('#chainName', e => e.value = ''); await pg.type('#chainName', n); await pg.click('#saveChain'); };
  await save('甲'); await save('乙'); await save('丙');
  eq('免费保存3条', await pg.evaluate(() => JSON.parse(localStorage['zw.chains']).length), 3);
  await save('丁');
  eq('第4条被拦并弹出Pro', [await pg.evaluate(() => JSON.parse(localStorage['zw.chains']).length), await pg.$eval('#proDlg', e => e.open)], [3, true]);
  await pg.evaluate(() => document.getElementById('proDlg').close());
  await save('甲');
  eq('同名覆盖不占名额', await pg.evaluate(() => JSON.parse(localStorage['zw.chains']).length), 3);
  eq('免费导出被拦', (await pg.click('#expChain'), await pg.$eval('#proDlg', e => e.open)), true);
  await pg.evaluate(() => document.getElementById('proDlg').close());
  // 应用规则链
  await pg.click('#presets .chip[data-i="0"]');
  await pg.click('#saved .sv[data-i="1"] .ap');
  eq('应用规则链恢复步骤', await pg.evaluate(() => JSON.parse(localStorage['zw.steps']).filter(s => s.on).map(s => s.id)), ['extract', 'sort']);
  await pg.click('#saved .sv[data-i="2"] .rm');
  eq('删除规则链', await pg.evaluate(() => JSON.parse(localStorage['zw.chains']).length), 2);
  // 批量未授权
  await pg.click('[data-tab=batch]');
  eq('批量-免费显示锁', [await pg.$eval('#batchLock', e => !e.hidden), await pg.$eval('#batchBody', e => e.hidden)], [true, true]);
  // 无效 key / 有效 key
  await pg.click('#proBtn');
  await pg.type('#licKey', 'ZW-AAAA-BBBB-CCCC-DDDD'); await pg.click('#licOk');
  eq('无效授权码', await pg.evaluate(() => ZW.validKey('ZW-AAAA-BBBB-CCCC-DDDD')), false);
  const key = await pg.evaluate(() => ZW.devKey('TEST', 'DEMO', '0001'));
  await pg.$eval('#licKey', e => e.value = ''); await pg.type('#licKey', key.toLowerCase()); await pg.click('#licOk');
  eq('有效授权码激活', [await pg.$eval('#proBtn', e => e.textContent), await pg.$eval('#licMsg', e => e.textContent)], ['Pro ✓', '已激活。']);
  await pg.evaluate(() => document.getElementById('proDlg').close());
  await pg.click('[data-tab=clean]');
  await save('丁'); await save('戊');
  eq('Pro 无限保存', await pg.evaluate(() => JSON.parse(localStorage['zw.chains']).length), 4);
  // 导入导出
  const exported = await pg.evaluate(() => JSON.stringify({ app: 'zhuanwen', v: 1, chains: JSON.parse(localStorage['zw.chains']).slice(0, 1).map(c => ({ name: '导入的', steps: c.steps })) }));
  require('fs').writeFileSync('/tmp/zw-import.json', exported);
  const [fc] = await Promise.all([pg.waitForFileChooser(), pg.click('#impChain')]);
  await fc.accept(['/tmp/zw-import.json']);
  await new Promise(r => setTimeout(r, 300));
  eq('Pro 导入规则链', await pg.evaluate(() => JSON.parse(localStorage['zw.chains']).some(c => c.name === '导入的')), true);
  // 批量
  await pg.click('#presets .chip[data-i="0"]');
  require('fs').writeFileSync('/tmp/zw-a.txt', ' x \n\nx\ny\n'); require('fs').writeFileSync('/tmp/zw-b.csv', 'a, b\n\n a, b\n');
  await pg.click('[data-tab=batch]');
  const inp = await pg.$('#batchFiles'); await inp.uploadFile('/tmp/zw-a.txt', '/tmp/zw-b.csv');
  await new Promise(r => setTimeout(r, 500));
  eq('批量-2个文件处理', (await pg.$$eval('#batchList .bi', e => e.map(x => x.querySelector('small').textContent))).map(s => s.replace(/\s/g, '')), ['9字符·5→2行', '12字符·4→1行']);
  // 取消授权
  await pg.click('#proBtn'); await pg.click('#licOff'); await pg.evaluate(() => document.getElementById('proDlg').close());
  eq('移除授权后回到免费', await pg.$eval('#proBtn', e => e.textContent), 'Pro 解锁');
  // 超限
  await pg.click('[data-tab=clean]');
  await pg.$eval('#in', e => { e.value = 'a'.repeat(1000001); e.dispatchEvent(new Event('input')); });
  await new Promise(r => setTimeout(r, 400));
  eq('免费超限提示', /超出免费版上限/.test(await pg.$eval('#errStat', e => e.textContent)), true);
  // 互转 UI
  await pg.click('[data-tab=convert]'); await pg.click('#cvSample');
  await pg.select('#cvOut', 'md');
  eq('互转UI MD输出', (await pg.$eval('#cvOutText', e => e.value)).startsWith('| 姓名'), true);
  await pg.click('#cvSwap');
  eq('互转UI 互换后输入为MD', [await pg.$eval('#cvIn', e => e.value), (await pg.$eval('#cvText', e => e.value)).startsWith('| 姓名')], ['md', true]);
  eq('无外部网络请求', reqs, []);
  eq('无控制台错误', errs, []);
  await b.close();
  console.log(`\n通过 ${pass}，失败 ${fail}`); process.exit(fail ? 1 : 0);
})();
