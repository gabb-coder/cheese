// Every word the player reads or hears, in English and Simplified Chinese (Mandarin).
//
// The language is a setting on each phone (stored in localStorage) and never goes to the
// server, so a mixed group can each play in their own language. Text is the same for
// every player in a language, so translating can't leak anything.

import { prefs } from './storage.js';

export const LANGS = [
  { code: 'en', label: 'English', speech: 'en-US' },
  { code: 'zh', label: '简体中文', speech: 'zh-CN' },
];

const EN = {
  'app.title': 'Cheese Thief',
  someone: 'someone',
  'list.and': ' and ',
  'list.comma': ', ',
  'unit.sec': '{n} s',
  'unit.min': '{n} min',
  'unit.secShort': '{n}s',

  // Settings sheet
  'settings.open': 'Settings',
  'settings.title': 'Settings',
  'settings.language': 'Language · 语言',
  'settings.done': 'Done',
  'settings.narrator': 'Narrator · 旁白',
  'settings.narrateHere': 'Read the script aloud on this phone',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.music': 'Music · 音乐',
  'settings.musicHere': 'Play background music on this phone',

  // Home
  'home.titleA': 'Cheese ',
  'home.titleB': 'Thief',
  'home.tagline': 'Someone in the mouse house is after the cheese. Who woke up when?',
  'home.name': 'Your name',
  'home.namePlaceholder': 'e.g. Big Cheese',
  'home.roomCode': 'Room code',
  'home.create': 'Create a room',
  'home.join': 'Join',
  'home.or': 'or',
  'home.orJoin': 'or join friends',
  'home.footnote': '4–8 players · one phone each',
  'home.needName': 'Pick a name first.',
  'home.codeLength': 'Room codes have 4 letters.',

  // Connecting
  'connecting.title': 'Waking up the mouse hole',
  'connecting.slow': "The server naps when nobody's playing. This can take up to a minute; we'll keep trying.",
  'connecting.normal': 'Connecting to the game server.',
  'connecting.retry': 'Try again now',

  // Notices
  'notice.expired.title': 'Room expired',
  'notice.expired.text': 'That room has gone to sleep. Create a new one!',
  'notice.serverRestart.title': 'Room expired',
  'notice.serverRestart.text': 'The server restarted, so the room was cleared. Create a new one!',
  'notice.empty.title': 'Room closed',
  'notice.empty.text': 'Everyone left the room.',
  'notice.seatGone.title': 'Seat not found',
  'notice.seatGone.text': 'Your seat in that room is gone. Join again with the room code.',
  'notice.kicked.title': 'Removed from room',
  'notice.kicked.text': 'The host removed you from the room.',
  'notice.replaced.title': 'Playing somewhere else',
  'notice.replaced.text': 'You opened your seat on another tab or device.',
  'notice.replaced.action': 'Play on this device',
  'notice.back': 'Back to start',

  // Connection
  'conn.retrySoon': 'Reconnecting… try again in a moment',
  'conn.reconnecting': 'Reconnecting',
  'conn.nowHost': "You're the host now 👑",

  // Lobby
  'lobby.roomCode': 'ROOM CODE',
  'lobby.codeAria': 'Room code {code}',
  'lobby.invite': '🔗  Invite friends',
  'lobby.shareText': 'Join my Cheese Thief room: {code}',
  'lobby.copied': 'Link copied!',
  'lobby.mice': 'Mice in the house',
  'lobby.you': 'you',
  'lobby.host': 'host',
  'lobby.bot': 'bot',
  'lobby.offline': 'offline',
  'lobby.remove': 'Remove {name}',
  'lobby.confirmRemove': 'Remove {name} from the room?',
  'lobby.emptySeat': 'waiting for a mouse…',
  'lobby.roomFor': 'room for {n} more',
  'lobby.addBot': '🤖  Add a bot',
  'lobby.need': ({ n }) => `Need ${n} more ${n === 1 ? 'mouse' : 'mice'}`,
  'lobby.start': 'Start the game',
  'lobby.waiting': 'Waiting for {name} to start',
  'lobby.theHost': 'the host',
  'lobby.leave': 'Leave room',
  'rules.title': '⚙️  Game settings',
  'rules.hour': 'Each hour',
  'rules.follower': 'Thief picks a Follower',
  'rules.discussion': 'Discussion',
  'rules.vote': 'Voting',
  'rules.narrate': 'Narrate out loud on my phone',
  'rules.narrateHelp': 'Any player can also switch narration on or off for their own phone with 🔊 during the game.',
  'rules.fast': '⚡ Fast timers (testing)',
  'rules.summary': '{hour} per hour · {discussion} discussion · {vote} to vote',

  // In game
  'game.room': 'ROOM {code}',
  'narr.on': 'Narration on for this phone. Tap to mute.',
  'narr.off': 'Narration off for this phone. Tap to narrate here.',
  'narr.test': '▶  Test the voice',
  'narr.tapToHear': '🔊 Tap the screen to hear the narrator',
  'narr.noVoice': "This browser can't speak. Try Safari on iPhone or Chrome on Android.",
  'narr.cantHear': "The voice didn't start. Turn off silent mode, turn the volume up and try again.",
  'lobby.narratorHere': '🔊 This phone is the narrator. Turn the volume up and silent mode off.',
  'lobby.narratorThere': "🔊 {name}'s phone is the narrator.",
  'lobby.narratorOff': '🔇 Captions only. To hear the script, turn on the narrator in ⚙️ settings.',

  // Role card
  'role.thief.title': 'You are the Cheese Thief!',
  'role.thief.short': 'Cheese Thief',
  'role.thief.hint': 'Take the cheese on your hour. After hour 6, choose a Follower. Win by not getting the most votes.',
  'role.sleepyhead.title': 'You are a Sleepyhead',
  'role.sleepyhead.short': 'Sleepyhead',
  'role.sleepyhead.hint': 'Wake on your hour and see what you can. Then find the Thief and vote them out!',
  'card.wakeAt': "You wake at {hour} o'clock",
  'card.wakeAtLabel': 'You wake at',
  'card.oclock': "{hour} o'clock",
  'card.holdCompact': '🤫 Hold to see your card',
  'card.hold': 'Press & hold to peek',
  'card.noLooking': "Make sure nobody's looking!",
  'card.aria': 'Press and hold to see your role and die',
  'die.aria': 'a die showing {n}',
  'hours.aria': 'Hour {n} of 6',
  'hours.ariaAll': 'Hours of the night',
  'art.peeker': 'A mouse peeking out of a mouse hole',
  'art.sunrise': 'The sun rising over a hill',

  // Reveal
  'reveal.eyebrow': 'Your secret card',
  'reveal.title': 'Who are you tonight?',
  'reveal.waiting': 'Waiting for the others',
  'reveal.done': "I've memorized it",
  'reveal.nightIn': 'Night falls in',
  'reveal.tip': 'Tip: keep your screen on during the night.',
  'reveal.readyAria': 'Who is ready',

  // Night notes
  'notes.title': '📜 Your night',
  'notes.private': '· only you can see this',
  'notes.rolledWoke': "You rolled a {die} and woke at {hour} o'clock.",
  'notes.alsoAwake': 'Also awake: {names}.',
  'notes.nobody': 'Nobody else was awake.',
  'notes.took': 'You took the cheese.',
  'notes.onTable': 'The cheese was still on the table.',
  'notes.gone': 'The cheese was already gone!',
  'notes.sawThief': 'You saw {name} take the cheese!',
  'notes.peeked': 'You peeked: {name} rolled a {die}.',
  'notes.rolled': 'You rolled a {die}.',
  'notes.yourFollower': 'Your Follower is {name}.',
  'notes.youFollow': "You are the Thief's Follower. The Thief is {name}. You win if the Thief isn't caught.",

  // Night
  'night.fallsTitle': 'Night falls…',
  'night.fallsText': 'Close your eyes. The night is about to begin.',
  'night.hourTitle': "{hour} o'clock",
  'night.sleepTight': 'Eyes closed… sleep tight.',
  'night.shh': 'Shhh…',
  'night.choosing': 'The Thief is choosing a Follower. Keep your eyes closed.',
  'night.youTook': 'You took the cheese!',
  'night.gone': 'The cheese is gone!',
  'night.onTable': 'The cheese is on the table.',
  'night.alsoAwake': 'Also awake: {names}',
  'night.nobody': 'Nobody else is awake.',
  'night.take': '🧀  Take the cheese',
  'night.takeSeen': "The others awake will see you do it. If you wait, you'll grab it automatically.",
  'night.takeAuto': "If you wait, you'll grab it automatically.",
  'night.saw': 'You saw {name} take the cheese!',
  'night.isThief': '{name} is the Cheese Thief.',
  'night.onlyOne': "You're the only one awake, so you may peek at one die.",
  'night.peek': "🔍  Peek at someone's die",
  'night.peekResult': '{name} rolled a {die}.',
  'night.yourHour': "It's your hour!",
  'night.openQuietly': 'Open your eyes, quietly.',
  'night.closeIn': 'Eyes close in',
  'night.chooseTitle': 'Choose your Follower',
  'night.chooseText': 'Your Follower wins with you if you are not caught. They will find out who you are.',
  'night.youChose': 'You chose {name}.',
  'night.seeSoon': 'They will see you in a moment.',
  'night.meetIn': 'Meet-up in',
  'night.autoPick': "If you don't choose, one is picked for you in",
  'night.isYourFollower': '{name} is your Follower',
  'night.knowsYou': '{name} now knows you are the Thief. Look at each other, quietly!',
  'night.youAreFollower': "You are the Thief's Follower!",
  'night.thiefIs': 'The Cheese Thief is',
  'night.followerWin': 'You win with the Thief if the Thief does not get the most votes. Keep it secret!',
  'night.checkFollower': 'You are the Follower!',
  'night.checkThief': 'You chose your Follower',
  'night.checkNot': "You're not the Follower",
  'night.yourFollowerIs': 'Your Follower is',
  'night.youAreA': 'You are a',
  'night.checkFollowerHint': "You win if the Thief isn't caught.",
  'night.checkThiefHint': 'Next, you two will see each other.',
  'night.checkNotHint': 'Close your eyes when the time is up.',
  'night.meeting': 'The Thief and the Follower are meeting. Keep your eyes closed.',
  'night.morning': 'Good morning!',
  'night.wakeUp': 'Everyone, open your eyes. The cheese is gone…',

  // Discussion and vote
  'day.eyebrow': 'Morning in the mouse house',
  'day.title': 'Who took the cheese?',
  'day.intro': 'Take turns: when did you wake up, and was the cheese there? Anyone may fib.',
  'day.voteIn': 'Voting starts in',
  'day.ready': "Everyone's ready: vote now",
  'day.hostEarly': 'The host can start the vote early.',
  'vote.progress': '{n} of {total} have voted',
  'vote.youVoted': 'You voted for {name}.',
  'vote.revealed': 'Votes are revealed when everyone has voted or time runs out.',
  'vote.pick': 'Pick a mouse',
  'vote.for': 'Vote for {name}',
  'vote.offline': '📵 = phone offline right now',
  'vote.eyebrow': 'Secret vote',
  'vote.title': 'Point at the Thief',
  'vote.secret': 'Nobody sees your vote until everyone has voted.',
  'vote.endsIn': 'Voting ends in',
  'vote.notes': '📜  Your night notes',

  // Results
  'results.caught': 'Caught!',
  'results.away': 'Got away!',
  'results.wasThief': '{name} was the Thief!',
  'results.gotAway': '{name} got away with it!',
  'results.sleepyWin': 'The Sleepyheads win.',
  'results.thiefWin': 'The Thief and the Follower, {name}, win.',
  'results.youWin': '🎉  You win!',
  'results.youLose': 'You lose this time',
  'results.thiefLabel': 'CHEESE THIEF',
  'results.followerLabel': 'FOLLOWER',
  'results.random': 'picked at random',
  'results.chosen': 'chosen by the Thief',
  'results.votes': 'The votes',
  'results.from': 'from {names}',
  'results.noVote': "Didn't vote: {names}",
  'results.cards': "Everyone's cards",
  'results.thief': 'Thief',
  'results.follower': 'Follower',
  'results.sleepyhead': 'Sleepyhead',
  'results.won': ' · won',
  'results.again': '🔁  Play again',
  'results.waitAgain': 'Waiting for {name} to start another round',

  // Narration (one line per step, the same for everyone)
  'say.test': "Hello! I'm the narrator. If you can hear me, you're all set.",
  'say.reveal': 'Welcome to Cheese Thief. Press and hold your card to see your role and your number.',
  'say.nightIntro': 'Night falls on the mouse house. Everyone, close your eyes.',
  'say.hour': ({ hour }) => `${hour > 1 ? 'Close your eyes. ' : ''}It's ${['', 'one', 'two', 'three', 'four', 'five', 'six'][hour]} o'clock. If you rolled a ${hour}, open your eyes.`,
  'say.followerChoice': 'Close your eyes. Cheese Thief, open your eyes and choose your Follower.',
  'say.followerCheck': 'Everyone, open your eyes. Are you the Follower?',
  'say.followerMeet': 'Everyone, close your eyes. Thief and Follower, open your eyes and look at each other. You have ten seconds.',
  'say.dawn': 'Everyone, close your eyes. … Good morning! Everyone, wake up. The cheese is gone!',
  'say.discussion': 'Time to talk. When did you wake up, and what did you see? Find the Thief!',
  'say.vote': 'Time to vote. Who is the Cheese Thief?',
  'say.caught': 'The votes are in. {thief} was the Cheese Thief, and got caught! The Sleepyheads win!',
  'say.away': 'The votes are in. The Cheese Thief was {thief}, and got away! {thief} and the Follower, {follower}, win!',
};

const ZH = {
  'app.title': '奶酪大盗',
  someone: '某人',
  'list.and': '和',
  'list.comma': '、',
  'unit.sec': '{n} 秒',
  'unit.min': '{n} 分钟',
  'unit.secShort': '{n}秒',

  'settings.open': '设置',
  'settings.title': '设置',
  'settings.language': '语言 · Language',
  'settings.done': '完成',
  'settings.narrator': '旁白 · Narrator',
  'settings.narrateHere': '用这台手机朗读旁白',
  'settings.on': '开',
  'settings.off': '关',
  'settings.music': '音乐 · Music',
  'settings.musicHere': '用这台手机播放背景音乐',

  'home.titleA': '奶酪',
  'home.titleB': '大盗',
  'home.tagline': '老鼠窝里有只老鼠盯上了奶酪。谁在几点醒来过？',
  'home.name': '你的名字',
  'home.namePlaceholder': '例如：奶酪王',
  'home.roomCode': '房间码',
  'home.create': '创建房间',
  'home.join': '加入',
  'home.or': '或',
  'home.orJoin': '或加入朋友的房间',
  'home.footnote': '4–8 名玩家 · 每人一部手机',
  'home.needName': '请先取个名字。',
  'home.codeLength': '房间码是 4 个字母。',

  'connecting.title': '正在唤醒老鼠洞',
  'connecting.slow': '没人玩的时候服务器会打个盹，唤醒最多需要一分钟，我们会一直重试。',
  'connecting.normal': '正在连接游戏服务器。',
  'connecting.retry': '立即重试',

  'notice.expired.title': '房间已过期',
  'notice.expired.text': '那个房间已经睡着了，创建一个新的吧！',
  'notice.serverRestart.title': '房间已过期',
  'notice.serverRestart.text': '服务器重启了，房间已被清空。创建一个新的吧！',
  'notice.empty.title': '房间已关闭',
  'notice.empty.text': '所有人都离开了房间。',
  'notice.seatGone.title': '找不到座位',
  'notice.seatGone.text': '你在那个房间的座位已经没了。请用房间码重新加入。',
  'notice.kicked.title': '已被移出房间',
  'notice.kicked.text': '房主把你移出了房间。',
  'notice.replaced.title': '正在别处游戏',
  'notice.replaced.text': '你在另一个标签页或设备上打开了你的座位。',
  'notice.replaced.action': '在这台设备上玩',
  'notice.back': '返回首页',

  'conn.retrySoon': '正在重新连接……请稍后再试',
  'conn.reconnecting': '正在重新连接',
  'conn.nowHost': '你现在是房主了 👑',

  'lobby.roomCode': '房间码',
  'lobby.codeAria': '房间码 {code}',
  'lobby.invite': '🔗  邀请朋友',
  'lobby.shareText': '来加入我的奶酪大盗房间：{code}',
  'lobby.copied': '链接已复制！',
  'lobby.mice': '窝里的老鼠',
  'lobby.you': '你',
  'lobby.host': '房主',
  'lobby.bot': '机器人',
  'lobby.offline': '离线',
  'lobby.remove': '移除 {name}',
  'lobby.confirmRemove': '要把 {name} 移出房间吗？',
  'lobby.emptySeat': '等待老鼠加入…',
  'lobby.roomFor': '还能再来 {n} 只',
  'lobby.addBot': '🤖  添加机器人',
  'lobby.need': '还差 {n} 只老鼠',
  'lobby.start': '开始游戏',
  'lobby.waiting': '等待 {name} 开始游戏',
  'lobby.theHost': '房主',
  'lobby.leave': '离开房间',
  'rules.title': '⚙️  游戏设置',
  'rules.hour': '每个钟点',
  'rules.follower': '大盗挑选跟班',
  'rules.discussion': '讨论',
  'rules.vote': '投票',
  'rules.narrate': '用我的手机朗读旁白',
  'rules.narrateHelp': '游戏中，每位玩家也可以用 🔊 为自己的手机开关旁白。',
  'rules.fast': '⚡ 快速计时（测试用）',
  'rules.summary': '每个钟点 {hour} · 讨论 {discussion} · 投票 {vote}',

  'game.room': '房间 {code}',
  'narr.on': '这台手机的旁白已开启。点按静音。',
  'narr.off': '这台手机的旁白已关闭。点按开启。',
  'narr.test': '▶  试听旁白',
  'narr.tapToHear': '🔊 点一下屏幕即可听到旁白',
  'narr.noVoice': '这个浏览器不支持朗读。iPhone 请用 Safari，安卓请用 Chrome。',
  'narr.cantHear': '语音没有播放。请关闭静音模式、调高音量后再试一次。',
  'lobby.narratorHere': '🔊 这台手机是旁白。请调高音量并关闭静音模式。',
  'lobby.narratorThere': '🔊 {name} 的手机是旁白。',
  'lobby.narratorOff': '🔇 只有字幕。想听旁白，请在 ⚙️ 设置里开启旁白。',

  'role.thief.title': '你是奶酪大盗！',
  'role.thief.short': '奶酪大盗',
  'role.thief.hint': '在你醒来的钟点偷走奶酪。6 点之后，挑选一名跟班。只要你不是得票最多的人，你就赢了。',
  'role.sleepyhead.title': '你是瞌睡鼠',
  'role.sleepyhead.short': '瞌睡鼠',
  'role.sleepyhead.hint': '在你的钟点醒来，看看能看到什么。然后找出大盗，把它投出来！',
  'card.wakeAt': '你在 {hour} 点醒来',
  'card.wakeAtLabel': '你醒来的时间',
  'card.oclock': '{hour} 点',
  'card.holdCompact': '🤫 按住查看你的卡牌',
  'card.hold': '按住偷看',
  'card.noLooking': '确保没人在偷看！',
  'card.aria': '按住查看你的身份和骰子',
  'die.aria': '骰子点数 {n}',
  'hours.aria': '第 {n} 个钟点，共 6 个',
  'hours.ariaAll': '夜晚的钟点',
  'art.peeker': '一只从老鼠洞里探出头的老鼠',
  'art.sunrise': '太阳从山后升起',

  'reveal.eyebrow': '你的秘密卡牌',
  'reveal.title': '今晚你是谁？',
  'reveal.waiting': '等待其他人',
  'reveal.done': '我记住了',
  'reveal.nightIn': '距离入夜',
  'reveal.tip': '提示：夜里请保持屏幕常亮。',
  'reveal.readyAria': '谁准备好了',

  'notes.title': '📜 你的夜晚',
  'notes.private': '· 只有你能看到',
  'notes.rolledWoke': '你掷出了 {die}，在 {hour} 点醒来。',
  'notes.alsoAwake': '同时醒着的：{names}。',
  'notes.nobody': '没有其他人醒着。',
  'notes.took': '你偷走了奶酪。',
  'notes.onTable': '奶酪还在桌上。',
  'notes.gone': '奶酪已经不见了！',
  'notes.sawThief': '你看到 {name} 偷走了奶酪！',
  'notes.peeked': '你偷看到：{name} 掷出了 {die}。',
  'notes.rolled': '你掷出了 {die}。',
  'notes.yourFollower': '你的跟班是 {name}。',
  'notes.youFollow': '你是大盗的跟班。大盗是 {name}。只要大盗没被抓住，你就赢了。',

  'night.fallsTitle': '夜幕降临…',
  'night.fallsText': '闭上眼睛，夜晚即将开始。',
  'night.hourTitle': '{hour} 点',
  'night.sleepTight': '闭上眼睛……好好睡。',
  'night.shh': '嘘……',
  'night.choosing': '大盗正在挑选跟班。请继续闭着眼睛。',
  'night.youTook': '你偷走了奶酪！',
  'night.gone': '奶酪不见了！',
  'night.onTable': '奶酪在桌上。',
  'night.alsoAwake': '同时醒着的：{names}',
  'night.nobody': '没有其他人醒着。',
  'night.take': '🧀  偷走奶酪',
  'night.takeSeen': '醒着的其他人会看到你偷。如果你一直不动，时间到时会自动偷走。',
  'night.takeAuto': '如果你一直不动，时间到时会自动偷走。',
  'night.saw': '你看到 {name} 偷走了奶酪！',
  'night.isThief': '{name} 就是奶酪大盗。',
  'night.onlyOne': '只有你醒着，所以你可以偷看一个人的骰子。',
  'night.peek': '🔍  偷看别人的骰子',
  'night.peekResult': '{name} 掷出了 {die}。',
  'night.yourHour': '轮到你了！',
  'night.openQuietly': '悄悄睁开眼睛。',
  'night.closeIn': '距离闭眼',
  'night.chooseTitle': '挑选你的跟班',
  'night.chooseText': '只要你没被抓住，跟班就和你一起获胜。对方会知道你是谁。',
  'night.youChose': '你选了 {name}。',
  'night.seeSoon': '对方马上就会看到你。',
  'night.meetIn': '距离碰头',
  'night.autoPick': '如果你不选，系统会随机挑选，剩余',
  'night.isYourFollower': '{name} 是你的跟班',
  'night.knowsYou': '{name} 现在知道你是大盗了。悄悄地互相看一眼吧！',
  'night.youAreFollower': '你是大盗的跟班！',
  'night.thiefIs': '奶酪大盗是',
  'night.followerWin': '只要大盗不是得票最多的人，你就和大盗一起获胜。要保密哦！',
  'night.checkFollower': '你是跟班！',
  'night.checkThief': '你选好了跟班',
  'night.checkNot': '你不是跟班',
  'night.yourFollowerIs': '你的跟班是',
  'night.youAreA': '你是一只',
  'night.checkFollowerHint': '大盗没被抓住，你就赢了。',
  'night.checkThiefHint': '接下来你们俩会看见彼此。',
  'night.checkNotHint': '时间到了请闭上眼睛。',
  'night.meeting': '大盗和跟班正在碰头。请继续闭着眼睛。',
  'night.morning': '早上好！',
  'night.wakeUp': '大家睁开眼睛吧。奶酪不见了……',

  'day.eyebrow': '老鼠窝的早晨',
  'day.title': '谁偷了奶酪？',
  'day.intro': '轮流说说：你几点醒来的？那时奶酪还在吗？谁都可能撒谎哦。',
  'day.voteIn': '距离投票',
  'day.ready': '大家都准备好了：开始投票',
  'day.hostEarly': '房主可以提前开始投票。',
  'vote.progress': '{n}/{total} 人已投票',
  'vote.youVoted': '你投给了 {name}。',
  'vote.revealed': '所有人投完票或时间到了之后，才会公布结果。',
  'vote.pick': '选一只老鼠',
  'vote.for': '投给 {name}',
  'vote.offline': '📵 = 手机暂时离线',
  'vote.eyebrow': '秘密投票',
  'vote.title': '指出大盗',
  'vote.secret': '在所有人投完票之前，没人能看到你的选择。',
  'vote.endsIn': '距离投票结束',
  'vote.notes': '📜  你的夜晚笔记',

  'results.caught': '抓到了！',
  'results.away': '逃脱了！',
  'results.wasThief': '{name} 就是大盗！',
  'results.gotAway': '{name} 成功逃脱了！',
  'results.sleepyWin': '瞌睡鼠们获胜。',
  'results.thiefWin': '大盗和跟班 {name} 获胜。',
  'results.youWin': '🎉  你赢了！',
  'results.youLose': '这次你输了',
  'results.thiefLabel': '奶酪大盗',
  'results.followerLabel': '跟班',
  'results.random': '随机挑选',
  'results.chosen': '由大盗挑选',
  'results.votes': '投票结果',
  'results.from': '来自 {names}',
  'results.noVote': '未投票：{names}',
  'results.cards': '所有人的卡牌',
  'results.thief': '大盗',
  'results.follower': '跟班',
  'results.sleepyhead': '瞌睡鼠',
  'results.won': ' · 获胜',
  'results.again': '🔁  再玩一局',
  'results.waitAgain': '等待 {name} 开始下一局',

  'say.test': '你好！我是旁白。如果你能听到我的声音，就一切就绪了。',
  'say.reveal': '欢迎来到奶酪大盗。按住你的卡牌，查看你的身份和点数。',
  'say.nightIntro': '夜幕降临老鼠窝。大家请闭上眼睛。',
  'say.hour': ({ hour }) => `${hour > 1 ? '请闭上眼睛。' : ''}现在是${['', '一', '两', '三', '四', '五', '六'][hour]}点。掷出${hour}点的玩家，请睁开眼睛。`,
  'say.followerChoice': '请闭上眼睛。奶酪大盗，请睁开眼睛，挑选你的跟班。',
  'say.followerCheck': '大家请睁开眼睛：你是跟班吗？',
  'say.followerMeet': '大家请闭上眼睛。大盗和跟班，请睁开眼睛，互相看一看。你们有十秒钟。',
  'say.dawn': '大家请闭上眼睛。……早上好！大家醒醒吧。奶酪不见了！',
  'say.discussion': '讨论时间到。你几点醒来的？看到了什么？找出大盗！',
  'say.vote': '投票时间到。谁是奶酪大盗？',
  'say.caught': '投票结束。{thief} 就是奶酪大盗，被抓住了！瞌睡鼠们获胜！',
  'say.away': '投票结束。奶酪大盗是 {thief}，成功逃脱了！{thief} 和跟班 {follower} 获胜！',

  // Server errors, by code (English uses the server's own text).
  'err.BAD_MESSAGE': '出了点问题，请刷新页面。',
  'err.BAD_NAME': '名字需为 1–16 个字符。',
  'err.ROOM_NOT_FOUND': '房间已过期或不存在，请创建一个新的。',
  'err.SEAT_NOT_FOUND': '你在那个房间的座位已经没了，请重新加入。',
  'err.GAME_IN_PROGRESS': '那局游戏已经开始了。',
  'err.NAME_TAKEN': '房间里已经有人用这个名字了。',
  'err.ROOM_FULL': '房间已满（8 名玩家）。',
  'err.NOT_ENOUGH_PLAYERS': '至少需要 4 名玩家。',
  'err.NOT_ALLOWED': '现在不能这样做。',
  'err.NOT_HOST': '只有房主可以这样做。',
  'err.NOT_SEATED': '请先加入房间。',
  'err.ALREADY_SEATED': '你已经在房间里了。',
  'err.BOTS_DISABLED': '这个服务器关闭了机器人。',
  'err.KICKED': '房主把你移出了房间。',
  'err.REPLACED': '你在另一个标签页或设备上打开了这个座位。',
  'err.RATE_LIMITED': '慢一点！',
  'err.WRONG_PHASE': '现在不能这样做。',
  'err.ALREADY_DONE': '已经完成了。',
  'err.BAD_TARGET': '不能选择这名玩家。',
  'err.NOT_IN_GAME': '你不在这局游戏中。',
  'err.UNKNOWN_INTENT': '出了点问题，请刷新页面。',
};

const DICTS = { en: EN, zh: ZH };

function initialLang() {
  if (DICTS[prefs.lang]) return prefs.lang;
  return /^zh/i.test(navigator.language ?? '') ? 'zh' : 'en';
}

let current = initialLang();
applyToDocument();

function applyToDocument() {
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
}

export const lang = () => current;
export const speechLang = () => LANGS.find((l) => l.code === current).speech;

export function setLang(code) {
  if (!DICTS[code]) return;
  current = code;
  prefs.lang = code;
  applyToDocument();
}

function lookup(key) {
  return DICTS[current][key] ?? EN[key];
}

// The text for `key` with {placeholders} filled in from `vars`.
export function t(key, vars = {}) {
  const entry = lookup(key);
  if (entry === undefined) return key;
  if (typeof entry === 'function') return entry(vars);
  return entry.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// Like t(), but placeholders may be DOM nodes (e.g. a bold name). Returns a list for h().
export function tx(key, vars = {}) {
  const entry = lookup(key) ?? key;
  return entry.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    return name && name in vars ? vars[name] : part;
  });
}

// "Ana, Ben and Cy" / "Ana、Ben和Cy"
export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(t('list.comma'))}${t('list.and')}${items[items.length - 1]}`;
}

// A server error in this phone's language (falls back to the server's English text).
export function errorText(msg) {
  return current !== 'en' && DICTS[current][`err.${msg.code}`] ? t(`err.${msg.code}`) : msg.message;
}

// "45 s" / "3 min", or in Chinese "45 秒" / "3 分钟".
export const duration = (sec) => (sec % 60 ? t('unit.sec', { n: sec }) : t('unit.min', { n: sec / 60 }));
