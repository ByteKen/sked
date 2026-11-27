(function () {
  try {
    var saved = localStorage.getItem('gantt_theme');
    var theme = saved === 'light' || saved === 'dark' ? saved : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#090B10' : '#F6F7FB');
  } catch (e) {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  }
})();
