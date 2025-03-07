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
    
    // Fix for directly navigating to the 3D View section
    const fixNav3dView = () => {
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
    };
    
    // Call the fix
    fixNav3dView();
    
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
    
    // Add active class to nav links
    const styleSheet = document.styleSheets[0];
    styleSheet.insertRule(`
        #category-nav ul li a.active {
            background-color: rgba(255, 255, 255, 0.2);
            font-weight: bold;
        }
    `, styleSheet.cssRules.length);
}); 