const { chromium } = require('playwright');
(async () => {
  try {
    console.log('Test 1: ephemeral context (no persistent profile)');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent('<h1>hello</h1>');
    console.log('  title:', await page.title());
    await browser.close();
    console.log('  OK');
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n')[0]);
  }
})();