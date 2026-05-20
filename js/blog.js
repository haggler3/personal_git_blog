/**
 * Dynamic Blog Engine
 * Fetches and filters technical articles, displaying them in a modal overlay
 */

document.addEventListener('DOMContentLoaded', () => {
    const postsContainer = document.getElementById('blog-posts-container');
    const searchInput = document.getElementById('blog-search');
    const filterButtons = document.querySelectorAll('.filter-tag-btn');
    const blogModal = document.getElementById('blog-modal');
    const modalContent = document.getElementById('modal-article-content');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalBackdrop = document.querySelector('.modal-backdrop');

    let blogPosts = [];
    let activeTagFilter = 'all';
    let searchQuery = '';

    // Fetch blog posts from JSON data store
    fetch('data/posts.json')
        .then(response => {
            if (!response.ok) {
                throw new Error("HTTP error " + response.status);
            }
            return response.json();
        })
        .then(data => {
            blogPosts = data;
            renderPosts();
        })
        .catch(err => {
            console.error("Error loading blog posts: ", err);
            postsContainer.innerHTML = `<p class="error-msg">Failed to load articles. Please run a local web server to fetch data.</p>`;
        });

    // Render cards to the DOM grid
    function renderPosts() {
        if (!postsContainer) return;
        postsContainer.innerHTML = '';

        // Filter posts
        const filteredPosts = blogPosts.filter(post => {
            const matchesCategory = activeTagFilter === 'all' || post.category.toLowerCase() === activeTagFilter.toLowerCase();
            const textToSearch = (post.title + ' ' + post.excerpt + ' ' + post.tags.join(' ')).toLowerCase();
            const matchesSearch = textToSearch.includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });

        if (filteredPosts.length === 0) {
            postsContainer.innerHTML = `<div class="no-posts"><p>No articles match your search criteria.</p></div>`;
            return;
        }

        filteredPosts.forEach(post => {
            const card = document.createElement('div');
            card.className = 'blog-card';
            card.innerHTML = `
                <div class="blog-card-meta">
                    <span class="blog-card-cat">${post.category}</span>
                    <span>${post.date}</span>
                </div>
                <h3>${post.title}</h3>
                <p>${post.excerpt}</p>
                <span class="blog-card-read">
                    Read Article <i data-lucide="arrow-right" class="arrow-icon"></i>
                </span>
            `;

            // Click event to open article modal
            card.addEventListener('click', () => openArticle(post));

            postsContainer.appendChild(card);
        });

        // Initialize icons inside injected markup
        lucide.createIcons();
    }

    // Search input handler
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderPosts();
        });
    }

    // Category filter button handler
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTagFilter = btn.getAttribute('data-tag');
            renderPosts();
        });
    });

    // Open Article in Modal Overlay
    function openArticle(post) {
        if (!blogModal || !modalContent) return;

        // Render full article structure
        modalContent.innerHTML = `
            <div class="article-header">
                <div class="article-meta">
                    <span>${post.category.toUpperCase()}</span>
                    <span>•</span>
                    <span>${post.date}</span>
                    <span>•</span>
                    <span>${post.readTime}</span>
                </div>
                <h1>${post.title}</h1>
            </div>
            <div class="article-body">
                ${post.content}
            </div>
        `;

        // Make modal visible
        blogModal.classList.add('active');
        blogModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden'; // Lock background scroll

        // MathJax/LaTeX renderer trigger if equations are written
        if (window.MathJax) {
            window.MathJax.typesetPromise();
        }
    }

    // Close Modal helpers
    function closeModal() {
        if (!blogModal) return;
        blogModal.classList.remove('active');
        blogModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = ''; // Unlock scroll
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }

    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', closeModal);
    }

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && blogModal.classList.contains('active')) {
            closeModal();
        }
    });
});
