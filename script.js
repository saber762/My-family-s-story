const pages = document.querySelectorAll('.page');

pages.forEach(page => {
  page.addEventListener('click', () => {
    page.classList.toggle('flipped');
  });
    });