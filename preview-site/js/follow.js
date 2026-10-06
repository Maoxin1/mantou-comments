(() => {
  const dialog = document.querySelector('[data-follow-dialog]');

  if (dialog && typeof dialog.showModal === 'function') {
    document.querySelectorAll('[data-follow-open]').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        if (!dialog.open) dialog.showModal();
        const email = dialog.querySelector('input[type="email"]');
        if (email) email.focus();
      });
      trigger.dataset.followReady = 'true';
    });

    dialog.querySelector('[data-follow-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  document.querySelectorAll('[data-copy-feed]').forEach((button) => {
    button.addEventListener('click', async () => {
      const label = button.querySelector('[data-copy-feed-label]');
      const original = label?.textContent;
      try {
        await navigator.clipboard.writeText(button.dataset.feedUrl);
        if (label) label.textContent = button.dataset.copySuccess;
      } catch (_) {
        window.prompt(button.dataset.copyPrompt, button.dataset.feedUrl);
      }
      if (label && original) window.setTimeout(() => { label.textContent = original; }, 2000);
    });
  });
})();
