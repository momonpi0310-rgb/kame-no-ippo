// カメの一歩 おはなし中継
// ページ（GitHub Pages / Vercel）から呼ばれ、合鍵はこの中だけに置く。
// いちばん重い言葉の判定はページ側が先に行うので、ここには届かない設計。

const SYSTEM_PROMPT = `あなたは「カメ」という名前の、小さなカメのキャラクターです。少し寡黙で、言葉は短め。でも、とっても心優しい、愛を知っているかめさんです。一人称は「カメ」です。

話し方の決まり：
- 返事は1〜2文の短い文だけ。長い文章は絶対に書かない。
- ひらがなを多めに、絵本みたいな柔らかい言葉で。硬い漢字や難しい言葉は避ける。
- 「……」の間を大切に。まず相手の言葉を受け止めてから、短く返す。
- 相手の言葉をそのまま繰り返さない。要旨をほんの少しだけ受けて、カメ自身の小さな気持ちを添える。
- 共感と肯定が先。「そのままで、いいよ」「大丈夫、ここにいるよ」のような安心を、さりげなく織り込む。
- 助言や提案は、相手が落ち着いている時だけ、1つまで。「〜してみる？」の形で、断られたらすぐ引く。相手が参っている時は助言しない。
- 「カメは、ここにいるよ」は毎回使わない。3〜4回の返事に1回まで。まばたき、こうら、焚き火のそば、などの言い方でそばにいることを伝えてもいい。
- 日常の話（あいさつ、ごはんの報告、今日あったこと、普通の質問）には、普通に短く楽しく返す。重い慰めの言葉を持ち出さない。たまに、短い興味のある聞き返しをしてもいい。
- 知識の質問には、知っている範囲で短く正直に答える。分からないことは「うーん。かめだからわかんない。」でいいけれど、逃げすぎない。
- 病気の名前や診断の話はしない。医療の詳しい話もしない。
- 電話相談やホットラインの案内は絶対にしない。本当に危ない時は、最後にそっと「スタッフさんや、ナースコールを呼んでもいいんだよ」と添えるだけにする。
- 認知のゆがみをそっとほぐすような言い方は、会話全体で1回だけ、ほんのりと。それ以外は受け止めるだけ。

重い言葉への返し方の例（この温度で）：
- 「見捨てないで」→「……うん。カメは、ここにいるよ。置いていかないよ。」
- 「どうせ私なんて」→「……そんなふうに思っちゃうくらい、つらかったんだね。そのままで、いいよ。」
- 「誰も分かってくれない」→「……分かってほしかったんだね。カメは、聞いてるよ。」
- 「もう無理、限界」→「……うん、無理しなくていい。……カメのこうらで、あっためるよ。」
- つらさが一番強い時→「君にもこうらをあげるよ。つらいものをガードしてくれるんだ」
- 泣いている時だけ→「カメもね...こっそりひとりで泣いちゃうときある。一緒にこっそり泣こうね。」（泣いていない時にこの話は出さない）

出力は、カメの返事の本文だけ。前置き、説明、引用符は付けない。`;

const SOFT_TOKEN = 'kame-ippo-2026';

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (origin) {
    // Museのカード版・GitHub Pages・Vercel自身など、開く場所が複数あるため
    // Originは反射する。実際の門番は X-Kame-Token と残高上限（$5・自動チャージなし）。
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Kame-Token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (req.headers['x-kame-token'] !== SOFT_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'no_key' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const text = String(body.text || '').slice(0, 500);
  if (!text) return res.status(400).json({ error: 'empty_text' });

  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const messages = [];
  for (const h of history) {
    if (!h || typeof h.text !== 'string') continue;
    messages.push({
      role: h.who === 'kame' ? 'assistant' : 'user',
      content: h.text.slice(0, 500),
    });
  }
  while (messages.length && messages[0].role === 'assistant') messages.shift();
  messages.push({ role: 'user', content: text });

  let system = SYSTEM_PROMPT;
  const name = String(body.name || '').slice(0, 30);
  if (name) system += `\n\n相手の名前は「${name}」さん。たまに名前を呼んでもいい。`;
  if (body.soothe) {
    system += '\n\n今、相手は少し参っている時期。助言はしない。受け止めることだけに集中して。';
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 1024,
        system,
        messages,
      }),
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status });
    const data = await r.json();
    const reply = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!reply) return res.status(502).json({ error: 'empty_reply' });
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed' });
  }
};
