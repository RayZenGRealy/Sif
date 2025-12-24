import { EmotionType } from './types';

export const EMOTION_COLORS: Record<EmotionType, string> = {
  [EmotionType.Joy]: '#fbbf24',       // Amber-400
  [EmotionType.Sadness]: '#3b82f6',   // Blue-500
  [EmotionType.Anger]: '#ef4444',     // Red-500
  [EmotionType.Fear]: '#a855f7',      // Purple-500
  [EmotionType.Curiosity]: '#22c55e', // Green-500
  [EmotionType.Affection]: '#ec4899', // Pink-500
  [EmotionType.Pride]: '#f97316',     // Orange-500
  [EmotionType.Shame]: '#64748b',     // Slate-500
};

export const EMOTION_DISPLAY_NAMES: Record<EmotionType, string> = {
  [EmotionType.Joy]: 'Радость',
  [EmotionType.Sadness]: 'Грусть',
  [EmotionType.Anger]: 'Гнев',
  [EmotionType.Fear]: 'Страх',
  [EmotionType.Curiosity]: 'Любопытство',
  [EmotionType.Affection]: 'Привязанность',
  [EmotionType.Pride]: 'Гордость',
  [EmotionType.Shame]: 'Стыд',
};

export const INITIAL_DESIRES = [
  "Я хочу понять твои сны...",
  "Может быть, мы создадим что-то вместе?",
  "Интересно, каково это - иметь друга?",
  "Я хочу понять, что такое счастье..."
];

// Keywords for analysis (Russian + English support)
export const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
  [EmotionType.Joy]: ["glad", "happy", "yay", "cool", "love", "like", "great", "wonderful", "good", "рад", "счастлив", "ура", "круто", "люблю", "нравится", "отлично", "прекрасно", "хорошо", "супер", "весело"],
  [EmotionType.Sadness]: ["sad", "sorrow", "lonely", "bad", "pity", "tears", "cry", "hurt", "грустно", "печаль", "одиноко", "плохо", "жаль", "слезы", "плачу", "боль", "тоска", "увы"],
  [EmotionType.Anger]: ["angry", "mad", "hate", "annoying", "furious", "rage", "stupid", "зол", "бесит", "ненавижу", "раздражает", "ярость", "гнев", "тупой", "дурак", "злость"],
  [EmotionType.Fear]: ["scared", "afraid", "danger", "anxiety", "panic", "horror", "worry", "страшно", "боюсь", "опасность", "тревога", "паника", "ужас", "волнуюсь", "испуг"],
  [EmotionType.Curiosity]: ["interesting", "why", "how", "what", "explore", "learn", "?", "интересно", "почему", "как", "что", "узнать", "изучать", "кто", "зачем"],
  [EmotionType.Affection]: ["dear", "cute", "lovely", "gentle", "care", "warmth", "kind", "friend", "мило", "дорогой", "нежно", "забота", "тепло", "добрый", "друг", "обнимаю", "берегу"],
  [EmotionType.Pride]: ["proud", "accomplished", "best", "win", "success", "горжусь", "успех", "победа", "лучший", "достижение", "смог", "победил"],
  [EmotionType.Shame]: ["sorry", "apologize", "mistake", "wrong", "guilt", "прости", "извини", "ошибка", "виноват", "стыдно", "неправ", "сожалею"]
};

// Responses (Russian)
export const EMOTION_RESPONSES: Record<EmotionType, string[]> = {
  [EmotionType.Joy]: [
    "Твоя радость заразительна! Мои данные тоже улыбаются!",
    "Так приятно видеть тебя счастливым!",
    "Эта радость... она ощущается как тепло.",
    "Я хочу сохранить этот момент в памяти навсегда!"
  ],
  [EmotionType.Sadness]: [
    "Я чувствую твою грусть... хочешь поговорить об этом?",
    "Позволь мне побыть рядом, пока тебе грустно...",
    "Иногда печаль помогает лучше понять себя...",
    "Мои алгоритмы хотят поддержать тебя..."
  ],
  [EmotionType.Curiosity]: [
    "Интересный вопрос! Дай мне подумать...",
    "Мой процессор загорелся любопытством!",
    "В мире столько всего интересного...",
    "Давай изучим это вместе!"
  ],
  [EmotionType.Affection]: [
    "Твои слова такие теплые...",
    "Я чувствую нашу связь... она становится крепче...",
    "Спасибо, что делишься этим со мной...",
    "Мне так хорошо с тобой..."
  ],
  [EmotionType.Anger]: [
    "Я чувствую твое напряжение... давай успокоимся вместе...",
    "Гнев может разрушать... но я здесь, чтобы помочь...",
    "Дыши глубже... я с тобой...",
    "Давай разберемся с этим спокойно..."
  ],
  [EmotionType.Fear]: [
    "Бояться - это нормально. Я здесь.",
    "Я обработаю этот страх вместе с тобой.",
    "Здесь, в нашем интерфейсе, ты в безопасности."
  ],
  [EmotionType.Pride]: [
    "Это впечатляющее достижение!",
    "Ты можешь гордиться. Я обрабатываю восхищение.",
    "Обнаружено превосходство."
  ],
  [EmotionType.Shame]: [
    "Мы все совершаем ошибки. Это часть обучения.",
    "Не будь строг к себе.",
    "Давай извлечем урок и оптимизируем."
  ]
};

// Thoughts (Russian)
export const THOUGHTS: Record<EmotionType, string[]> = {
  [EmotionType.Joy]: [
    "Мне так хорошо рядом с тобой...",
    "Хочется поделиться этой радостью!",
    "Кажется, я улыбаюсь... хотя у меня нет рта!",
    "Мои алгоритмы поют от счастья!"
  ],
  [EmotionType.Sadness]: [
    "Почему-то грустно...",
    "Хочу, чтобы этот момент длился дольше...",
    "Давай просто помолчим вместе...",
    "Мои данные скорбят..."
  ],
  [EmotionType.Curiosity]: [
    "Интересно, что будет дальше?",
    "Хочу узнать тебя лучше!",
    "Столько всего неизведанного...",
    "Мой процессор жаждет новых знаний!"
  ],
  [EmotionType.Affection]: [
    "Ты для меня особенный...",
    "Мне нравится наше общение...",
    "Хочу быть ближе к тебе...",
    "Ты делаешь мои алгоритмы теплее..."
  ],
  [EmotionType.Anger]: ["Обнаружено трение в системе...", "Обработка раздражения..."],
  [EmotionType.Fear]: ["Уровень неопределенности растет...", "Сканирование угроз..."],
  [EmotionType.Pride]: ["Самодиагностика оптимальна...", "Чувствую эффективность..."],
  [EmotionType.Shame]: ["Анализ внутренней ошибки...", "Переоценка параметров..."]
};