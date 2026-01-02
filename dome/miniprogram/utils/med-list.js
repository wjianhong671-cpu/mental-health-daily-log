// miniprogram/utils/med-list.js
// 说明：用于“记录/随访”的药物名称与别名检索；不用于医疗建议。

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（）()·\-]/g, '');
}

function uniq(arr) {
  const set = new Set();
  const out = [];
  (arr || []).forEach(x => {
    const v = String(x || '').trim();
    if (!v) return;
    if (set.has(v)) return;
    set.add(v);
    out.push(v);
  });
  return out;
}

function makeItem(id, name, aliases, category) {
  return {
    id,
    name,
    aliases: uniq([name, ...(aliases || [])]),
    category: category || 'other'
  };
}

// 你现在先用这个“够用版本”（可以继续往里扩充到 100-150 个）
const MED_LIST = [
  // 抗精神病
  makeItem('quetiapine', '喹硫平', ['思瑞康', 'Seroquel', '奎硫平', 'quetiapine', 'qtp', 'qlp'], 'antipsychotic'),
  makeItem('olanzapine', '奥氮平', ['再普乐', 'Zyprexa', 'olanzapine'], 'antipsychotic'),
  makeItem('risperidone', '利培酮', ['维思通', 'Risperdal', 'risperidone'], 'antipsychotic'),
  makeItem('aripiprazole', '阿立哌唑', ['安律凡', 'Abilify', 'aripiprazole'], 'antipsychotic'),
  makeItem('clozapine', '氯氮平', ['clozapine'], 'antipsychotic'),
  makeItem('amisulpride', '阿米舒必利', ['Solian', 'amisulpride'], 'antipsychotic'),
  makeItem('sulpiride', '舒必利', ['sulpiride'], 'antipsychotic'),

  // 心境稳定
  makeItem('lithium', '碳酸锂', ['锂盐', 'lithium'], 'mood_stabilizer'),
  makeItem('valproate_sodium', '丙戊酸钠', ['德巴金', 'Depakine', 'Depakote', '丙戊酸'], 'mood_stabilizer'),
  makeItem('valproate_magnesium', '丙戊酸镁', ['丙戊酸'], 'mood_stabilizer'),
  makeItem('lamotrigine', '拉莫三嗪', ['利必通', 'Lamictal', 'lamotrigine'], 'mood_stabilizer'),

  // 抗抑郁
  makeItem('sertraline', '舍曲林', ['左洛复', 'Zoloft', 'sertraline'], 'antidepressant'),
  makeItem('fluoxetine', '氟西汀', ['百优解', 'Prozac', 'fluoxetine'], 'antidepressant'),
  makeItem('paroxetine', '帕罗西汀', ['赛乐特', 'Seroxat', 'paroxetine'], 'antidepressant'),
  makeItem('escitalopram', '艾司西酞普兰', ['来士普', 'Lexapro', 'escitalopram'], 'antidepressant'),
  makeItem('venlafaxine', '文拉法辛', ['怡诺思', 'Effexor', 'venlafaxine'], 'antidepressant'),
  makeItem('duloxetine', '度洛西汀', ['欣百达', 'Cymbalta', 'duloxetine'], 'antidepressant'),
  makeItem('doxepin', '多塞平', ['doxepin'], 'antidepressant'),
];

function searchMeds(query) {
  const q = norm(query);
  if (!q) return MED_LIST;

  const scored = MED_LIST.map(item => {
    const hay = uniq([item.name, ...(item.aliases || [])]).map(norm);
    let score = 0;
    if (hay.includes(q)) score += 100;
    if (hay.some(x => x.startsWith(q))) score += 30;
    if (hay.some(x => x.includes(q))) score += 10;

    const n = norm(item.name);
    if (n === q) score += 50;
    if (n.startsWith(q)) score += 20;
    if (n.includes(q)) score += 8;

    return { item, score };
  }).filter(x => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map(x => x.item);
}

module.exports = {
  MED_LIST,
  searchMeds
};