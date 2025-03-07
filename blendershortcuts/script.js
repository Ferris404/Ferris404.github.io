document.addEventListener('DOMContentLoaded', function() {
    // Important Shortcuts Panel Functionality
    const importantShortcutsBtn = document.getElementById('important-shortcuts-btn');
    const importantShortcutsPanel = document.getElementById('important-shortcuts-panel');
    const closePanelBtn = document.getElementById('close-panel-btn');
    
    // Open the panel when the button is clicked
    importantShortcutsBtn.addEventListener('click', function() {
        importantShortcutsPanel.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling behind panel
    });
    
    // Close the panel when the close button is clicked
    closePanelBtn.addEventListener('click', function() {
        importantShortcutsPanel.classList.remove('active');
        document.body.style.overflow = ''; // Re-enable scrolling
    });
    
    // Close panel when ESC key is pressed
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && importantShortcutsPanel.classList.contains('active')) {
            importantShortcutsPanel.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
    
    // Also close panel when clicking outside the content
    importantShortcutsPanel.addEventListener('click', function(e) {
        // Close only if the click was directly on the panel background (not its children)
        if (e.target === importantShortcutsPanel) {
            importantShortcutsPanel.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Theme Toggle Functionality
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');
    const htmlElement = document.documentElement;
    
    // Check for saved theme preference and apply it
    const savedTheme = localStorage.getItem('theme') || 'light';
    htmlElement.setAttribute('data-theme', savedTheme);
    
    // Update icon to match current theme
    updateThemeIcon(savedTheme);
    
    // Toggle theme on button click
    themeToggle.addEventListener('click', function() {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        updateThemeIcon(newTheme);
    });
    
    // Function to update icon based on theme
    function updateThemeIcon(theme) {
        if (theme === 'dark') {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }
    
    // Create back to top button
    const backToTopBtn = document.createElement('div');
    backToTopBtn.classList.add('back-to-top');
    backToTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    document.body.appendChild(backToTopBtn);
    
    // Show/hide back to top button based on scroll position
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });
    
    // Scroll to top when button is clicked
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // Add a search functionality
    const headerContainer = document.querySelector('header');
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <div class="search-box">
            <input type="text" id="shortcut-search" placeholder="Search shortcuts...">
            <i class="fas fa-search"></i>
        </div>
    `;
    
    // Insert search after the header title
    headerContainer.appendChild(searchContainer);
    
    const searchInput = document.getElementById('shortcut-search');
    const shortcutItems = document.querySelectorAll('.shortcut-item');
    
    // Search functionality
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        shortcutItems.forEach(item => {
            const shortcutText = item.textContent.toLowerCase();
            const shouldShow = shortcutText.includes(searchTerm);
            
            item.style.display = shouldShow ? '' : 'none';
        });
        
        // Show/hide sections based on whether they have visible shortcut items
        document.querySelectorAll('.shortcut-section').forEach(section => {
            const visibleItems = section.querySelectorAll('.shortcut-item[style="display: none;"]');
            if (visibleItems.length === section.querySelectorAll('.shortcut-item').length) {
                section.style.display = 'none';
            } else {
                section.style.display = '';
            }
        });
    });
    
    // Fix for directly navigating to the 3D View section
    const threeDViewLink = document.querySelector('a[href="#3d-view"]');
    const threeDViewSection = document.getElementById('3d-view');
    
    if (threeDViewLink && threeDViewSection) {
        threeDViewLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Force scroll to the 3D View section
            const headerOffset = 80;
            const elementPosition = threeDViewSection.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
            
            // Update URL and active state
            history.pushState(null, null, '#3d-view');
            
            // Remove active class from all links
            const navLinks = document.querySelectorAll('#category-nav a');
            navLinks.forEach(link => {
                link.classList.remove('active');
            });
            
            // Add active class to 3D View link
            threeDViewLink.classList.add('active');
        });
    }
    
    // Add style for search box
    const styleSheet = document.styleSheets[0];
    styleSheet.insertRule(`
        .search-container {
            margin: 20px auto 0;
            max-width: 500px;
        }
    `, styleSheet.cssRules.length);
    
    styleSheet.insertRule(`
        .search-box {
            position: relative;
            display: flex;
            align-items: center;
        }
    `, styleSheet.cssRules.length);
    
    styleSheet.insertRule(`
        .search-box input {
            width: 100%;
            padding: 12px 20px;
            padding-right: 45px;
            border-radius: 50px;
            border: none;
            background-color: rgba(255, 255, 255, 0.2);
            color: var(--header-text);
            font-size: 1rem;
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
        }
    `, styleSheet.cssRules.length);
    
    styleSheet.insertRule(`
        .search-box input:focus {
            outline: none;
            background-color: rgba(255, 255, 255, 0.3);
            box-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
        }
    `, styleSheet.cssRules.length);
    
    styleSheet.insertRule(`
        .search-box input::placeholder {
            color: rgba(255, 255, 255, 0.8);
        }
    `, styleSheet.cssRules.length);
    
    styleSheet.insertRule(`
        .search-box i {
            position: absolute;
            right: 15px;
            color: var(--header-text);
            opacity: 0.8;
        }
    `, styleSheet.cssRules.length);
    
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('#category-nav a');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Ensure consistent scrolling behavior
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
                
                // Update URL without page reload
                history.pushState(null, null, targetId);
                
                // Add active class to clicked link
                navLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            } else {
                console.error(`Element with id ${targetId} not found`);
            }
        });
    });
    
    // Direct hash navigation on page load
    if (window.location.hash) {
        const hash = window.location.hash;
        const targetElement = document.querySelector(hash);
        
        if (targetElement) {
            setTimeout(() => {
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
                
                // Highlight the correct nav item
                const activeNavLink = document.querySelector(`#category-nav a[href="${hash}"]`);
                if (activeNavLink) {
                    navLinks.forEach(l => l.classList.remove('active'));
                    activeNavLink.classList.add('active');
                }
            }, 300); // Small delay to ensure DOM is ready
        }
    }
    
    // Highlight current section in nav
    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('.shortcut-section');
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const scrollPosition = window.scrollY;
            
            if (scrollPosition >= sectionTop - 100 && scrollPosition < sectionTop + sectionHeight - 100) {
                const currentId = '#' + section.getAttribute('id');
                
                // Remove active class from all links
                navLinks.forEach(link => {
                    link.classList.remove('active');
                });
                
                // Add active class to current section link
                const activeLink = document.querySelector(`#category-nav a[href="${currentId}"]`);
                if (activeLink) {
                    activeLink.classList.add('active');
                }
            }
        });
    });
}); 