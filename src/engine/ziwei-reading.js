/* 紫微斗數星曜解讀。專案裡沒有紫微的教材，這裡的文字是坊間通行說法的整理，全部列為參考，各派講法不盡相同；
   文字等使用者過目（專案文件〈紫微星曜解讀-文字稿（待過目）〉），要改只改下面幾張表，測試會掃文字的分寸。
   分寸照第 19 講：不說重話；四化落在六親宮只寫命主自己的緣分、投入、牽掛，不論斷家人；疾厄宮一律不作健康判斷。 */
// 十四主星：[性質, 發揮得好, 要留意]。每顆星都寫兩面，說的是傾向
const STARS = {
  紫微: ['帝星，主尊貴與主導', '有領導的格局，穩重、能扛責任', '主觀、好面子，不容易聽進別人的意見'],
  天機: ['智星，主思考與變動', '反應快、善於分析與企劃，學東西快', '想得多、容易焦慮，想法和環境的變動都多'],
  太陽: ['主光明、付出與名聲', '熱心、坦率，樂於照顧別人', '好強、勞心勞力，付出常比收穫多'],
  武曲: ['財星，主剛毅與行動', '務實、執行力強，重信用，對數字敏感', '剛硬少轉圜，容易一個人扛'],
  天同: ['福星，主溫和與享受', '好相處、知足，有人緣', '安於現狀、衝勁不足，情緒容易起伏'],
  廉貞: ['主原則與交際，傳統稱次桃花', '有原則、善交際，敢衝敢拚', '好勝、心思重，容易捲進是非'],
  天府: ['庫星，主穩重與守成', '穩健、有度量，善於守成與管理', '偏保守、重安逸，開創力較弱'],
  太陰: ['主內斂、細膩與積蓄', '體貼、有耐心，善於規劃與儲蓄', '想得多、偏被動，心事容易放在心裡'],
  貪狼: ['主慾望、才藝與交際，傳統稱桃花星', '多才多藝、善交際，有企圖心', '興趣多而不專、容易貪多，慾望要拿捏'],
  巨門: ['暗星，主口才與是非', '善於言辭、肯鑽研，觀察入微', '多疑、容易有口舌，話出口前多想一步'],
  天相: ['印星，主輔佐與公道', '守規矩、樂於助人，善於協調，重視形象', '主見較弱，容易受身邊的人和環境影響'],
  天梁: ['蔭星，主照顧與原則', '有長者風範、肯照顧人，遇事能化解', '好說教、固執，容易管太多'],
  七殺: ['將星，主衝勁與獨立', '果決、敢拚，能獨當一面', '急躁、起伏大，容易單打獨鬥'],
  破軍: ['耗星，主開創與變革', '敢破舊立新、行動力強，能吃苦', '變動多、耗費大，耐性不足']
};
// 亮度只分四段說：廟旺、得利、平、不陷
const BRIGHT = {
  廟: '亮度「廟」：這顆星的特質比較容易順著好的那一面發揮。',
  旺: '亮度「旺」：這顆星的特質比較容易順著好的那一面發揮。',
  得: '亮度「得」：中上。',
  利: '亮度「利」：中上。',
  平: '亮度「平」：普通。',
  不: '亮度「不」（不得地）：偏弱，特質發揮起來比較費力，要留意的那一面比較容易出現。',
  陷: '亮度「陷」（落陷）：最弱，特質發揮起來比較費力，要留意的那一面比較容易出現。'
};
// 十二宮各看什麼。疾厄宮不作健康判斷，句子另外寫（huaText、zwReadLayer）
const PALACES = {
  命宮: '個性與一生的基調',
  兄弟: '兄弟姊妹、同輩，以及和人合作的緣分',
  夫妻: '伴侶與親密關係的相處',
  子女: '子女與晚輩，也看合夥與創作',
  財帛: '賺錢與用錢的方式',
  疾厄: '身心的狀態',
  遷移: '出外、環境變動，以及在外的人際',
  僕役: '朋友、同事、部屬與人脈',
  官祿: '工作與事業的型態',
  田宅: '家、居住環境與不動產',
  福德: '精神生活、興趣與享受',
  父母: '父母、長輩與上司，也看文書'
};
// 四化的意思。化忌照第 19 講不說重話：是功課，不等於壞事
const HUA = {
  祿: '緣分與資源比較多，做起來比較順',
  權: '投入多、想主導，有掌握的企圖',
  科: '重名聲與條理，容易得到幫助與肯定',
  忌: '牽掛最多、要多花心力；是功課，不等於壞事'
};
// 身宮只會落在這六個宮
const BODY = {
  命宮: '命宮和身宮同宮：先天的個性和後天的重心一致，前後比較不變。',
  夫妻: '身宮在夫妻宮：後天的重心放在伴侶與感情，另一半的影響比較大。',
  財帛: '身宮在財帛宮：後天的重心放在賺錢與物質，作風務實。',
  遷移: '身宮在遷移宮：後天的重心在外面，往外發展、環境變動的影響比較大。',
  官祿: '身宮在官祿宮：後天的重心放在工作與事業。',
  福德: '身宮在福德宮：後天的重心放在精神生活、興趣與享受。'
};
// 命宮三方四正裡的六吉、六煞，以及祿存、天馬
const LUCKY = { 左輔: '同輩與部屬的助力', 右弼: '同輩與部屬的助力', 文昌: '學習、文書與表達', 文曲: '才藝、口才與表達', 天魁: '長輩與貴人的提攜', 天鉞: '長輩與貴人的提攜' };
const SHA = {
  擎羊: '衝勁強、敢爭，也容易起衝突',
  陀羅: '耐磨、有韌性，也容易拖延與糾結',
  火星: '爆發力強，也容易急躁',
  鈴星: '沉得住氣、後勁足，也容易悶著才發作',
  地空: '想法跳脫、不受拘束，也容易落空',
  地劫: '敢冒險、求變，也容易有起落與耗費'
};
const OTHER = { 祿存: '穩定的財源，作風偏保守', 天馬: '多動、奔波與遠行' };
// 一顆主星的解讀：名稱、亮度、生年四化，加上三句與亮度那一句
const starNote = s => {
  const [nature, good, care] = STARS[s.name];
  return { name: s.name, bright: s.brightness || '', hua: s.mutagen || '', nature, good, care, brightNote: BRIGHT[s.brightness] || '' };
};
// 某顆星在哪一宮（主星或輔星）。四化的星都在這兩類裡
const palaceOf = (c, star) => c.palaces.find(p => p.majorStars.concat(p.minorStars).some(s => s.name === star));
// 一句四化：「〔星〕化〔祿權科忌〕在〔宮〕：〔這十年／這一年〕「〔這一宮看什麼〕」這一塊，〔四化的意思〕。」疾厄宮只寫不作健康判斷
function huaText(star, hua, palace, when = '') {
  if (palace === '疾厄') return `${star}化${hua}在疾厄宮：傳統上看身心的狀態。這裡不作健康判斷，身體的事請找醫師。`;
  return `${star}化${hua}在${palace === '命宮' ? '命宮' : `${palace}宮`}：${when}「${PALACES[palace]}」這一塊，${HUA[hua]}。`;
}
/**
 * 紫微星曜解讀（本命）：命宮主星（空宮借對宮）、身宮、生年四化落宮、命宮三方四正的吉煞。
 * 只取盤上有的星去對文字表，不計分、不推導格局、不看星曜組合。生年四化跟著流派設定的四化版本（zw.sihua）。
 * @param {import('./ziwei.js').ZiweiChart} zw ziwei() 的結果
 */
export function zwReading(zw) {
  const c = zw.chart, P = c.palaces;
  const mi = P.findIndex(p => p.name === '命宮'), ming = P[mi], opp = P[(mi + 6) % 12];
  const empty = !ming.majorStars.length;
  const body = P.find(p => p.isBodyPalace);
  const sihua = zw.sihua[zw.yearGZ[0]].map((star, k) => {
    const hua = '祿權科忌'[k], p = palaceOf(c, star);
    return { hua, star, palace: p.name, text: huaText(star, hua, p.name) };
  });
  const four = [mi, (mi + 4) % 12, (mi + 8) % 12, (mi + 6) % 12].map(i => P[i]);
  const pick = table => four.flatMap(p => p.minorStars.filter(s => table[s.name]).map(s => ({ name: s.name, palace: p.name, text: table[s.name] })));
  const lucky = pick(LUCKY), sha = pick(SHA), other = pick(OTHER);
  const text = lucky.length && sha.length ? '吉星、煞星都有：有助力，也有波折。' : lucky.length ? '有吉星、沒有煞星：助力比較多。' : sha.length ? '有煞星、沒有吉星：衝勁與波折並存，分寸要自己拿捏。' : '六吉、六煞都不在三方四正：比較單純，看主星本身。';
  return {
    ming: {
      gz: ming.heavenlyStem + ming.earthlyBranch,
      empty,
      stars: ming.majorStars.map(starNote),
      borrowed: empty ? opp.majorStars.map(starNote) : [],
      note: empty ? `命宮沒有主星，借對宮（遷移宮）的${opp.majorStars.map(s => s.name).join('、') || '星'}來看。通行的說法是借來的星力量打折，個性比較受環境影響。` : ''
    },
    body: { palace: body.name, text: BODY[body.name] },
    sihua,
    around: { lucky, sha, other, text }
  };
}
/**
 * 疊上一層運限（大限或流年）時多寫的一段：運限命宮疊在本命的哪一宮，以及運限四化落在本命的哪一宮。流月以下不寫。
 * @param {import('./ziwei.js').ZiweiChart} zw ziwei() 的結果
 * @param {import('./ziwei-yun.js').YunLayer} layer zwDaXian() 或 zwLiuNian() 的結果
 * @param {string} when 句子裡的時間，例如「這十年」「這一年」
 */
export function zwReadLayer(zw, layer, when) {
  const c = zw.chart, at = c.palaces[layer.index].name;
  return {
    at,
    text: at === '疾厄' ? `命宮疊在本命的疾厄宮。傳統上看身心的狀態；這裡不作健康判斷。` : `命宮疊在本命的${at === '命宮' ? '命宮' : `${at}宮`}，${when}的重心和「${PALACES[at]}」有關。`,
    hua: (layer.hua || []).map((star, k) => {
      const hua = '祿權科忌'[k], p = palaceOf(c, star);
      return { hua, star, palace: p.name, text: huaText(star, hua, p.name, when) };
    })
  };
}

/** 星曜解讀用到的全部文字表（測試掃文字分寸用；要改文字只改這幾張表） */
export const ZW_TEXTS = { STARS, BRIGHT, PALACES, HUA, BODY, LUCKY, SHA, OTHER };
