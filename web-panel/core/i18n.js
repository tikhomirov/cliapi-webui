/**
 * Internationalization (i18n) module for CLIProxyAPI Web Panel
 * Supports: en (default), ru
 */

const translations = {
  en: {
    // Common
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    refresh: 'Refresh',
    search: 'Search',
    filter: 'Filter',
    close: 'Close',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    copy: 'Copy',
    test: 'Test',
    configure: 'Configure',
    details: 'Details',
    benchmark: 'Benchmark',
    enable: 'Enable',
    disable: 'Disable',
    remove: 'Remove',
    reset: 'Reset',
    compress: 'Compress',
    
    // Time
    justNow: 'just now',
    secondsAgo: '{n}s ago',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h {m}m ago',
    daysAgo: '{n}d ago',
    
    // Navigation
    dashboard: 'Dashboard',
    providers: 'Providers',
    models: 'Models',
    chat: 'Chat',
    keys: 'API Keys',
    settings: 'Settings',
    config: 'Configuration',
    traffic: 'Traffic',
    connections: 'Connections',
    
    // Error states
    errorLoading: 'Loading Error',
    pageNotFound: 'Page Not Found',
    redirectingToDashboard: 'Redirecting to Dashboard...',
    loadingTimeout: 'Loading timeout ({n}s)',
    dataLoadingTimeout: 'Data loading timeout ({n}s)',
    
    // Toast
    undo: 'Undo',
    copied: 'Copied',
    saved: 'Saved',
    deleted: 'Deleted',
    cacheRefreshing: 'Cache is refreshing...',
    checking: 'Checking...',
    parametersReset: 'Parameters reset',
    contextCompressed: 'Context compressed',
    nothingToCompress: 'Nothing to compress: too few messages',
    noApiKeyAvailable: 'No API key available',
    
    // Model filters
    all: 'All',
    allProviders: 'All Providers',
    available: 'Available',
    unavailable: 'Unavailable',
    disabled: 'Disabled',
    vision: 'Vision',
    reasoning: 'Reasoning',
    searchPlaceholder: 'Search by name, alias, provider...',
    
    // Model statuses
    modelAvailable: 'Available',
    modelUnavailable: 'Unavailable',
    modelEnabled: 'Enabled',
    modelDisabled: 'Disabled',
    verified: 'Verified',
    estimated: 'Estimated',
    
    // Model actions
    editModel: 'Edit',
    enableModel: 'Enable',
    disableModel: 'Disable',
    
    // Model stats
    totalModels: 'Total Models',
    totalRequests: 'Total Requests',
    avgPerRequest: 'Avg per request',
    avgPerDay: 'Avg / day',
    avgResponseTime: 'Avg response time',
    errorsTotal: 'Errors / total',
    
    // Model info
    context: 'Context',
    tokens: 'tokens',
    provider: 'Provider',
    alias: 'Alias',
    name: 'Name',
    status: 'Status',
    actions: 'Actions',
    filters: 'Filters',
    
    // Cleanup
    cleanupStaleModels: 'Cleanup Stale Models',
    removeFromConfig: 'Remove these models from config?',
    modelsDeleted: 'Deleted {n} models',
    
    // Providers
    openaiCompatibleProviders: 'OpenAI-Compatible Providers',
    noConfiguredProviders: 'No configured providers',
    apiKeys: 'API Keys',
    oauthProviders: 'OAuth Providers',
    noAlias: 'no alias',
    channel: 'Channel',
    authorized: 'Authorized',
    notAuthorized: 'Not authorized',
    oauthToken: 'OAuth token',
    apiKeysInConfig: 'API keys in config',
    loginViaOauth: 'Login via OAuth',
    logout: 'Logout',
    oauthTokens: 'OAuth Tokens',
    file: 'File',
    reconnect: 'Reconnect',
    check: 'Check',
    providerCheck: 'Provider Check',
    checkAll: 'Check All',
    allProvidersWorking: 'All providers are working',
    providersWithErrors: 'Providers with errors',
    response: 'Response',
    ms: 'ms',
    timeout: 'Timeout',
    
    // Chat
    newChat: 'New Chat',
    selectModel: 'Select model',
    searchModel: 'Search model',
    nothingFound: 'Nothing found',
    supportsImages: 'Supports images',
    noImageSupport: 'No image support',
    noSavedChats: 'No saved chats',
    untitled: 'Untitled',
    systemPrompt: 'System prompt',
    global: 'global',
    activePrompt: 'Active prompt',
    clearMessages: 'Clear messages in this chat',
    resetContext: 'Reset context',
    compressContext: 'Compress context',
    compressHistoryDesc: 'Replace old messages with a brief summary',
    selectModelAndSend: 'Select model and send a message',
    imageUploadSupported: 'Image upload supported for vision models',
    copyMessage: 'Copy message',
    failedToCopy: 'Failed to copy',
    typeMessage: 'Type a message',
    attachImage: 'Attach image',
    attachFile: 'Attach file (as text)',
    visionDisabled: 'This model is not marked as vision (images disabled)',
    removeImage: 'Remove',
    errorReadingImage: 'Error reading image',
    fileTooLarge: 'File too large',
    limit: 'limit',
    sending: 'Sending...',
    stop: 'Stop',
    send: 'Send',
    
    // Model descriptions
    modelGpt54: 'OpenAI\'s flagship multimodal model with deep reasoning',
    modelGpt53: 'OpenAI code-optimized model',
    modelGpt52: 'Powerful OpenAI multimodal model',
    modelGpt51: 'Fast OpenAI next-generation model',
    modelGpt5Codex: 'OpenAI model for code generation',
    modelGpt5: 'Powerful OpenAI model',
    modelDeepseek: 'Advanced model with deep reasoning',
    modelClaude: 'Multimodal AI assistant by Anthropic',
    modelGemini: 'Google multimodal AI model',
    modelQwen: 'Language model by Alibaba Cloud',
    modelKimi: 'AI assistant by Moonshot AI',
    modelGlm: 'Language model by Zhipu AI',
    modelMinimax: 'Multimodal model by MiniMax',
    modelMimo: 'Multimodal model by Xiaomi',
    modelLlama: 'Open model by Meta',
    modelGemma: 'Compact open model by Google',
    modelMistral: 'European language model by Mistral',
    modelPixtral: 'Multimodal model by Mistral',
    
    // Benchmark presets
    benchmarkStandard: 'Standard',
    benchmarkCode: 'Code',
    benchmarkMath: 'Math',
    benchmarkContext: 'Context',
    
    benchmarkStandardPrompt: 'Explain quantum entanglement in simple terms. Maximum 3 sentences.',
    benchmarkStandardKeywords: 'quantum,entanglement,particles',
    
    benchmarkCodePrompt: 'Write a quicksort function in Python with docstring and usage example.',
    
    benchmarkMathPrompt: 'Solve the quadratic equation: 2x² + 5x - 3 = 0. Show all steps.',
    benchmarkMathKeywords: 'x,=,discriminant',
    
    benchmarkContextPrompt: 'Read the text and identify 3 main theses:\n\nArtificial intelligence is a field of computer science...',
    benchmarkContextKeywords: 'thesis,main,conclusion',
    
    // Summary compression
    compressSummaryPrompt: 'Summarize this conversation in 10-20 bullet points + important facts/preferences.',
    compressedContext: 'Compressed context (summary)',
  },
  
  ru: {
    // Common
    loading: 'Загрузка...',
    error: 'Ошибка',
    success: 'Успешно',
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    edit: 'Изменить',
    create: 'Создать',
    refresh: 'Обновить',
    search: 'Поиск',
    filter: 'Фильтр',
    close: 'Закрыть',
    confirm: 'Подтвердить',
    back: 'Назад',
    next: 'Далее',
    done: 'Готово',
    copy: 'Копировать',
    test: 'Тест',
    configure: 'Настроить',
    details: 'Подробнее',
    benchmark: 'Бенчмарк',
    enable: 'Включить',
    disable: 'Выключить',
    remove: 'Удалить',
    reset: 'Сбросить',
    compress: 'Сжать',
    
    // Time
    justNow: 'только что',
    secondsAgo: '{n} сек назад',
    minutesAgo: '{n} мин назад',
    hoursAgo: '{n} ч {m} мин назад',
    daysAgo: '{n} дн назад',
    
    // Navigation
    dashboard: 'Дашборд',
    providers: 'Провайдеры',
    models: 'Модели',
    chat: 'Чат',
    keys: 'API Keys',
    settings: 'Настройки',
    config: 'Конфигурация',
    traffic: 'Трафик',
    connections: 'Подключения',
    
    // Error states
    errorLoading: 'Ошибка загрузки',
    pageNotFound: 'Страница не найдена',
    redirectingToDashboard: 'Переход на Dashboard...',
    loadingTimeout: 'Таймаут загрузки ({n}с)',
    dataLoadingTimeout: 'Таймаут загрузки данных ({n}с)',
    
    // Toast
    undo: 'Отменить',
    copied: 'Скопировано',
    saved: 'Сохранено',
    deleted: 'Удалено',
    cacheRefreshing: 'Кэш обновляется...',
    checking: 'Проверка...',
    parametersReset: 'Параметры сброшены',
    contextCompressed: 'Контекст сжат',
    nothingToCompress: 'Нечего сжимать: сообщений слишком мало',
    noApiKeyAvailable: 'Нет доступного API ключа',
    
    // Model filters
    all: 'Все',
    allProviders: 'Все провайдеры',
    available: 'Доступны',
    unavailable: 'Недоступны',
    disabled: 'Отключены',
    vision: 'Vision',
    reasoning: 'Reasoning',
    searchPlaceholder: 'Поиск по имени, алиасу, провайдеру...',
    
    // Model statuses
    modelAvailable: 'Доступна',
    modelUnavailable: 'Недоступна',
    modelEnabled: 'Включена',
    modelDisabled: 'Отключена',
    verified: 'Проверено',
    estimated: 'Оценка',
    
    // Model actions
    editModel: 'Редактировать',
    enableModel: 'Включить',
    disableModel: 'Выключить',
    
    // Model stats
    totalModels: 'Всего моделей',
    totalRequests: 'Всего запросов',
    avgPerRequest: 'В среднем за запрос',
    avgPerDay: 'В среднем / день',
    avgResponseTime: 'Среднее время ответа',
    errorsTotal: 'Ошибок / всего',
    
    // Model info
    context: 'Контекст',
    tokens: 'токенов',
    provider: 'Провайдер',
    alias: 'Алиас',
    name: 'Название',
    status: 'Статус',
    actions: 'Действия',
    filters: 'Фильтры',
    
    // Cleanup
    cleanupStaleModels: 'Очистка stale моделей',
    removeFromConfig: 'Удалить эти модели из конфига?',
    modelsDeleted: 'Удалено {n} моделей',
    
    // Providers
    openaiCompatibleProviders: 'OpenAI-совместимые провайдеры',
    noConfiguredProviders: 'Нет настроенных провайдеров',
    apiKeys: 'API-ключи',
    oauthProviders: 'OAuth провайдеры',
    noAlias: 'без алиаса',
    channel: 'Канал',
    authorized: 'Авторизован',
    notAuthorized: 'Не авторизован',
    oauthToken: 'OAuth токен',
    apiKeysInConfig: 'API ключей в конфиге',
    loginViaOauth: 'Войти через OAuth',
    logout: 'Выйти',
    oauthTokens: 'OAuth-токены',
    file: 'Файл',
    reconnect: 'Переподключить',
    check: 'Проверить',
    providerCheck: 'Проверка провайдеров',
    checkAll: 'Проверить всех',
    allProvidersWorking: 'Все провайдеры работают',
    providersWithErrors: 'Провайдеров с ошибками',
    response: 'Ответ',
    ms: 'мс',
    timeout: 'Таймаут',
    
    // Chat
    newChat: 'Новый чат',
    selectModel: 'Выберите модель',
    searchModel: 'Поиск модели',
    nothingFound: 'Ничего не найдено',
    supportsImages: 'Поддерживает изображения',
    noImageSupport: 'Без поддержки изображений',
    noSavedChats: 'Нет сохранённых чатов',
    untitled: 'Без названия',
    systemPrompt: 'Системный промпт',
    global: 'глобальный',
    activePrompt: 'Активный промпт',
    clearMessages: 'Очистить сообщения в этом чате',
    resetContext: 'Сброс контекста',
    compressContext: 'Сжать контекст',
    compressHistoryDesc: 'Заменить старые сообщения краткой сводкой',
    selectModelAndSend: 'Выберите модель и отправьте сообщение',
    imageUploadSupported: 'Поддерживается отправка изображений для vision-моделей',
    copyMessage: 'Копировать сообщение',
    failedToCopy: 'Не удалось скопировать',
    typeMessage: 'Введите сообщение',
    attachImage: 'Прикрепить изображение',
    attachFile: 'Прикрепить файл (как текст)',
    visionDisabled: 'Эта модель не отмечена как vision (изображения отключены)',
    removeImage: 'Удалить',
    errorReadingImage: 'Ошибка чтения изображения',
    fileTooLarge: 'Файл слишком большой',
    limit: 'лимит',
    sending: 'Отправка...',
    stop: 'Остановить',
    send: 'Отправить',
    
    // Model descriptions
    modelGpt54: 'Флагманская мультимодальная модель OpenAI с глубоким рассуждением',
    modelGpt53: 'Код-оптимизированная модель OpenAI',
    modelGpt52: 'Мощная мультимодальная модель OpenAI',
    modelGpt51: 'Быстрая модель OpenAI нового поколения',
    modelGpt5Codex: 'Модель OpenAI для генерации кода',
    modelGpt5: 'Мощная модель OpenAI',
    modelDeepseek: 'Продвинутая модель с глубоким рассуждением',
    modelClaude: 'Мультимодальный ИИ-ассистент от Anthropic',
    modelGemini: 'Мультимодальная модель Google',
    modelQwen: 'Языковая модель от Alibaba Cloud',
    modelKimi: 'ИИ-ассистент от Moonshot AI',
    modelGlm: 'Языковая модель от Zhipu AI',
    modelMinimax: 'Мультимодальная модель от MiniMax',
    modelMimo: 'Мультимодальная модель от Xiaomi',
    modelLlama: 'Открытая модель от Meta',
    modelGemma: 'Компактная открытая модель от Google',
    modelMistral: 'Европейская языковая модель',
    modelPixtral: 'Мультимодальная модель от Mistral',
    
    // Benchmark presets
    benchmarkStandard: 'Стандартный',
    benchmarkCode: 'Код',
    benchmarkMath: 'Математика',
    benchmarkContext: 'Контекст',
    
    benchmarkStandardPrompt: 'Объясни квантовую запутанность простыми словами. Максимум 3 предложения.',
    benchmarkStandardKeywords: 'квант,запутанность,частиц',
    
    benchmarkCodePrompt: 'Напиши функцию quicksort на Python с докстрингом и примером использования.',
    
    benchmarkMathPrompt: 'Реши квадратное уравнение: 2x² + 5x - 3 = 0. Покажи все шаги решения.',
    benchmarkMathKeywords: 'x,=,дискриминант',
    
    benchmarkContextPrompt: 'Прочитай текст и выдели 3 главных тезиса:\n\nИскусственный интеллект — это область компьютерных наук...',
    benchmarkContextKeywords: 'тезис,главн,вывод',
    
    // Summary compression
    compressSummaryPrompt: 'Сожми контекст. Дай краткую сводку диалога в 10–20 пунктах + важные факты/предпочтения. Пиши по-русски.',
    compressedContext: 'Сжатый контекст (summary)',
  }
};

let currentLocale = localStorage.getItem('locale') || 'en';

export function t(key, params = {}) {
  const locale = translations[currentLocale] || translations.en;
  let text = locale[key] || translations.en[key] || key;
  
  // Replace parameters like {n}, {m}
  Object.entries(params).forEach(([k, v]) => {
    text = text.replace(`{${k}}`, v);
  });
  
  return text;
}

export function setLocale(locale) {
  if (translations[locale]) {
    currentLocale = locale;
    localStorage.setItem('locale', locale);
    document.dispatchEvent(new CustomEvent('localeChanged', { detail: locale }));
  }
}

export function getLocale() {
  return currentLocale;
}

export function getAvailableLocales() {
  return Object.keys(translations);
}

// For backwards compatibility with old code
translations['zh-CN'] = translations.en; // Fallback to English for Chinese
