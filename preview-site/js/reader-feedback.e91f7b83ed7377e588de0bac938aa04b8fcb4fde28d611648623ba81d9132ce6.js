// Connect only after the reader opens the feedback area. All counts live on Waline.
const options = document.querySelector('[data-feedback-server]');

if (options) {
  const trigger = options.querySelector('[data-feedback-load]');
  const status = options.querySelector('[data-feedback-status]');
  const helpful = options.querySelector('[data-feedback-helpful]');
  const helpfulLabel = options.querySelector('[data-feedback-helpful-label]');
  const count = options.querySelector('[data-feedback-count]');
  const english = options.dataset.feedbackLang === 'en';
  const copy = english ? {
    loading: 'Opening the conversation…',
    failed: 'The comments could not load. Try again, or send me a private email below.',
    retry: 'Try again',
    placeholder: 'What stayed with you? Questions and different views are welcome. Comments appear after approval.',
    helpful: 'Helpful',
    helped: 'Marked as helpful',
    reactionFailed: 'That reaction could not be saved. Please try again.',
    countFailed: 'Your reaction was saved; the total could not refresh yet.',
  } : {
    loading: '正在搬小板凳…',
    failed: '评论暂时没加载出来。可以重试，也可以通过下方邮件私下聊聊。',
    retry: '再试一次',
    placeholder: '哪一点让你有共鸣？有疑问或不同看法也欢迎。评论审核后显示。',
    helpful: '有帮助',
    helped: '已觉得有帮助',
    reactionFailed: '这次点赞没存上，请再试一次。',
    countFailed: '你的反馈已保存，总数暂时没刷新出来。',
  };
  let busy = false;
  let instance;
  let stylesheet;
  let clientAttempt = 0;
  const loadClient = async () => {
    // Browsers retain failed module imports by URL. Change the key only after
    // an import failure; successful modules still reuse their content address.
    const source = options.dataset.feedbackClient;
    const url = clientAttempt ? `${source}?retry=${clientAttempt}` : source;
    try {
      return await import(url);
    } catch (error) {
      clientAttempt += 1;
      throw error;
    }
  };
  const connection = {
    serverURL: options.dataset.feedbackServer,
    path: options.dataset.feedbackPath,
    lang: english ? 'en-US' : 'zh-CN',
  };
  const preferenceKey = `mantou-helpful:${connection.path}`;
  let voted = false;
  try { voted = localStorage.getItem(preferenceKey) === '1'; } catch { /* Storage can be disabled. */ }
  const showPreference = () => {
    helpful.setAttribute('aria-pressed', String(voted));
    helpfulLabel.textContent = voted ? copy.helped : copy.helpful;
  };
  const showCount = (counters) => {
    const total = counters?.[0]?.reaction0;
    if (!Number.isFinite(total) || total < 0) throw new Error('Unexpected reaction count');
    count.textContent = String(total);
  };

  const loadStyles = () => {
    if (stylesheet) return stylesheet;
    stylesheet = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/lib/waline/3.15.2/waline.css';
      const timer = setTimeout(() => {
        link.remove();
        stylesheet = undefined;
        reject(new Error('Stylesheet timed out'));
      }, 10000);
      link.onload = () => { clearTimeout(timer); resolve(); };
      link.onerror = () => {
        clearTimeout(timer);
        link.remove();
        stylesheet = undefined;
        reject(new Error('Stylesheet could not load'));
      };
      document.head.append(link);
    });
    return stylesheet;
  };

  trigger.addEventListener('click', async () => {
    if (busy || instance) return;
    busy = true;
    trigger.disabled = true;
    options.setAttribute('aria-busy', 'true');
    status.textContent = copy.loading;
    const abort = new AbortController();
    let timer;
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new Error('Comments timed out')); }, 12000);
    });
    try {
      const [{ init, getComment, getArticleCounter, updateArticleCounter }] = await Promise.race([
        Promise.all([loadClient(), loadStyles()]),
        deadline,
      ]);
      // A reachable page is not enough: the comment database must answer too.
      const counterOptions = { ...connection, paths: [connection.path], type: ['reaction0'] };
      const [comments, counters] = await Promise.all([
        getComment({ ...connection, page: 1, pageSize: 1, sortBy: 'latest', signal: abort.signal }),
        getArticleCounter({ ...counterOptions, signal: abort.signal }),
      ]);
      // Validate the required pagination fields from Waline 3.15.2 before mounting.
      if (!comments || !Array.isArray(comments.data) ||
          !Number.isInteger(comments.count) || comments.count < 0 ||
          !Number.isInteger(comments.page) || comments.page < 1 ||
          !Number.isInteger(comments.pageSize) || comments.pageSize < 1 ||
          !Number.isInteger(comments.totalPages) || comments.totalPages < 0) {
        throw new Error('Unexpected comment response');
      }
      showCount(counters);
      instance = init({
        ...connection,
        el: '#reader-comments',
        dark: 'body[theme="dark"]',
        login: 'disable',
        meta: ['nick', 'mail'],
        requiredMeta: ['nick'],
        wordLimit: [1, 1000],
        pageSize: 5,
        reaction: false,
        locale: { placeholder: copy.placeholder },
        emoji: false,
        search: false,
        imageUploader: false,
        highlighter: false,
        texRenderer: false,
        pageview: false,
        comment: false,
        noRss: true,
      });
      showPreference();
      helpful.hidden = false;
      helpful.addEventListener('click', async () => {
        helpful.disabled = true;
        status.textContent = '';
        try {
          await updateArticleCounter({ ...connection, type: 'reaction0', action: voted ? 'desc' : 'inc' });
          voted = !voted;
          try { localStorage.setItem(preferenceKey, voted ? '1' : '0'); } catch { /* Keep working for this visit. */ }
          showPreference();
          try {
            showCount(await getArticleCounter(counterOptions));
          } catch {
            count.textContent = '';
            status.textContent = copy.countFailed;
          }
        } catch {
          status.textContent = copy.reactionFailed;
        } finally {
          helpful.disabled = false;
        }
      });
      trigger.hidden = true;
      status.textContent = '';
      options.querySelector('textarea')?.focus();
    } catch {
      status.textContent = copy.failed;
      trigger.textContent = copy.retry;
      trigger.disabled = false;
    } finally {
      clearTimeout(timer);
      busy = false;
      options.removeAttribute('aria-busy');
    }
  });
}
