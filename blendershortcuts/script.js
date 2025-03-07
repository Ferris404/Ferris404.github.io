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
    
    // Add back to top button
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
    
    // Add print button
    const printBtn = document.createElement('div');
    printBtn.classList.add('print-btn');
    printBtn.setAttribute('title', 'Print Shortcuts');
    printBtn.innerHTML = '<i class="fas fa-print"></i>';
    document.body.appendChild(printBtn);
    
    // Print the page when button is clicked
    printBtn.addEventListener('click', function() {
        window.print();
    });
    
    // Add home link to header
    const header = document.querySelector('header');
    const homeLink = document.createElement('a');
    homeLink.href = '../';
    homeLink.className = 'home-link';
    homeLink.innerHTML = '<i class="fas fa-home"></i> Back to Portfolio';
    header.appendChild(homeLink);
    
    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading';
    loadingIndicator.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loadingIndicator);
    
    // Store all shortcut items for search functionality
    const shortcutItems = document.querySelectorAll('.shortcut-item');
    
    // Add a search functionality
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <div class="search-box">
            <input type="text" id="shortcut-search" placeholder="Search shortcuts...">
            <i class="fas fa-search"></i>
        </div>
    `;
    
    // Insert search after the header title
    header.appendChild(searchContainer);
    
    const searchInput = document.getElementById('shortcut-search');
    
    // Search functionality
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        // Show loading indicator for searches longer than 3 characters
        if (searchTerm.length > 2) {
            loadingIndicator.classList.add('active');
            
            // Use setTimeout to allow the loading indicator to render
            setTimeout(() => {
                performSearch(searchTerm);
                loadingIndicator.classList.remove('active');
            }, 100);
        } else if (searchTerm.length === 0) {
            // Reset search if input is empty
            shortcutItems.forEach(item => {
                item.style.display = '';
            });
            
            // Show all sections
            document.querySelectorAll('.shortcut-section').forEach(section => {
                section.style.display = '';
                
                // Update shortcut count
                updateShortcutCount(section);
            });
        }
    });
    
    function performSearch(searchTerm) {
        shortcutItems.forEach(item => {
            const shortcutText = item.textContent.toLowerCase();
            const shouldShow = shortcutText.includes(searchTerm);
            
            item.style.display = shouldShow ? '' : 'none';
        });
        
        // Show/hide sections based on whether they have visible shortcut items
        document.querySelectorAll('.shortcut-section').forEach(section => {
            const visibleItems = Array.from(section.querySelectorAll('.shortcut-item')).filter(
                item => item.style.display !== 'none'
            );
            
            if (visibleItems.length === 0) {
                section.style.display = 'none';
            } else {
                section.style.display = '';
                
                // Update shortcut count
                const countBadge = section.querySelector('.shortcut-count');
                if (countBadge) {
                    countBadge.textContent = visibleItems.length;
                }
            }
        });
    }
    
    // Add shortcut count badges to each section
    document.querySelectorAll('.shortcut-section').forEach(updateShortcutCount);
    
    function updateShortcutCount(section) {
        const sectionTitle = section.querySelector('h2');
        const shortcuts = section.querySelectorAll('.shortcut-item');
        const visibleShortcuts = Array.from(shortcuts).filter(item => item.style.display !== 'none');
        
        // Create or update count badge
        let countBadge = section.querySelector('.shortcut-count');
        
        if (!countBadge) {
            countBadge = document.createElement('span');
            countBadge.className = 'shortcut-count';
            sectionTitle.appendChild(countBadge);
        }
        
        countBadge.textContent = visibleShortcuts.length;
    }
    
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