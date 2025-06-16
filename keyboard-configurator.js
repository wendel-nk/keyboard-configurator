let isScrolling = false;

class ProductConfigurator {
  //#region Initialization and setup
constructor() {
  this.data = JSON.parse(document.getElementById('configurator-data').textContent);

  console.log('💾 Loaded configurator-data:', this.data);
  console.log('🔧 Parsed conflicts:', this.data.conflicts);

    this.parentProductTitle = this.data.parentProductTitle;
    this.components = this.data.components;
    this.conflicts = this.data.conflicts || []; // **Add this line**
    this.selectedComponent = null;
    this.configuration = {};
    this.optionsContent = document.querySelector('.configurator__options');
    this.selectedVariants = new Map();
    this.initialImages = new Map(); // Track initial/current state of images
    this.temporarySelections = new Map(); // Track temporary selections
    this.showPlaceholders = true; // Default to true
    this.totalRequiredComponents = 0;
    this.completedRequiredComponents = 0;
    this.toastTimeouts = new Map(); // Track timeouts for each toast
    this.selectedVariant = null; // Store the selected variant
    this.quantities = new Map(); // Track quantities for optional components
    this.isMobileLayout = this.checkIsMobile();
  this.currencySymbol = (this.data && this.data.currencySymbol) ? this.data.currencySymbol : '$';
  this.preorderStatus = this.data.preorderStatus || 'live';
    
    // Carousel-related properties
    this.carouselIndex = 0;      // which card is currently “in front”
    this.carouselCards = [];     // array of DOM elements for each component card
    this.carouselIsDragging = false; // tracks if user is swiping
    this.carouselStartX = 0;     // initial X for swipe
    this.carouselCurrentX = 0;   // current X for swipe
    
    this.initialIsMobile = this.checkIsMobile();
    
    // Set up event delegation for quantity changes
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('variant-quantity')) {
        this.handleQuantityChange(e);
      }
    });
  
  this.conflictBadges = new Map();
  this.preloadedImages = new Set();

  document.getElementById('apply-config-button')?.addEventListener('click', () => this.applyConfig());

  this.init();
}

  init() {
    // Initialize all required properties
    this.selectedVariants = new Map();
    this.completedRequiredComponents = 0;
    this.totalRequiredComponents = this.components.filter(c => c.required).length;
    this.selectedOptionalComponents = new Map();

    // Initialize preorder checkbox listener if it exists
    const preorderCheckbox = document.querySelector('#cb');
    if (preorderCheckbox) {
        preorderCheckbox.addEventListener('change', () => {
            const hasConflict = this.hasComponentConflicts();
            const missingRequired = this.getCompletedRequiredCount() < this.totalRequiredComponents;
            this.updateAddToCartButton(hasConflict, missingRequired);
        });
    }

    // Load configurator data

    // Initialize the configurator
    this.initializeComponentTabs();
    this.setUpMobileLayout();
    this.setupComponentCards();
    this.initializeConfiguratorSummary();
    this.initializeSpecsAccordion();
    this.setupResponsiveListener();
    this.setupKeyboardNavigation();
    this.setupRemoveButton();
    this.initializeEventListeners();
    this.preloadAllVariantImages();

    // Check if cart has items and show view cart link if it does
    fetch('/cart.js')
      .then(response => response.json())
      .then(cart => {
        const viewCartLink = document.querySelector('.view-cart-link');
        if (viewCartLink && cart.item_count > 0) {
          viewCartLink.style.display = 'block';
        }
      })
      .catch(error => console.error('Error fetching cart:', error));

    // If placeholders are disabled, hide all layers initially
    if (!this.showPlaceholders) {
      document.querySelectorAll('.component-layer').forEach(layer => {
        layer.classList.add('hidden');
      });
    }

    

    // Add navigation button listeners
    const prevButton = document.querySelector('.prev-component');
    const nextButton = document.querySelector('.next-component');
    const forwardButton = document.querySelector('.forward-component');

    if (prevButton) {
      prevButton.addEventListener('click', () => {
        this.navigateComponents('prev');
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        this.navigateComponents('next');
      });
    }

    if (forwardButton) {
      forwardButton.addEventListener('click', () => {
        this.navigateComponents('next');
      });
    }

    // Add click handler for add to cart button
    const addToCartButton = document.querySelector('.add-to-cart-button');
    if (addToCartButton) {
      addToCartButton.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent default form submission
        
        // Add loading state
        addToCartButton.classList.add('loading');
        addToCartButton.textContent = 'Adding to Cart...';
        addToCartButton.disabled = true;

        try {
          await this.addConfigurationToCart();
          
          // Update button text to show success
          addToCartButton.classList.remove('loading');
          addToCartButton.textContent = 'Added to Cart!';
          addToCartButton.disabled = true;

          // Show view cart link if it exists
          const viewCartLink = document.querySelector('.view-cart-link');
          if (viewCartLink) {
            viewCartLink.style.display = 'block';
          }
        } catch (error) {
          // Reset button state on error
          addToCartButton.classList.remove('loading');
          addToCartButton.textContent = 'Add to Cart';
          addToCartButton.disabled = false;
          
          console.error('Error adding to cart:', error);
          this.showToast('Error adding to cart. Please try again.', 'error');
        }
      });
    }
    const activeTab = document.querySelector('.tab-button.active');
if (activeTab) activeTab.click();

    const hasConflict = this.hasComponentConflicts();
    const missingRequired = this.getCompletedRequiredCount() < this.totalRequiredComponents;
    this.updateAddToCartButton(hasConflict, missingRequired);
  }

  preloadAllVariantImages() {
  // Create a queue of images to preload
  const imagesToPreload = [];
  
  // Collect all variant images from all components
  this.components.forEach(component => {
    // Add component featured image
    if (component.featured_image) {
      imagesToPreload.push(component.featured_image);
    }
    
    // Add blueprint image
    if (component.blueprint) {
      imagesToPreload.push(component.blueprint);
    }
    
    // Add all variant images
    component.variants.forEach(variant => {
      if (variant.featured_image) {
        imagesToPreload.push(variant.featured_image);
      }
      if (variant.layer_image) {
        imagesToPreload.push(variant.layer_image);
      }
    });
  });
  
  // Remove duplicates
  const uniqueImages = [...new Set(imagesToPreload)];
  
  // Preload images in chunks to avoid overwhelming the browser
  const preloadChunk = (startIndex, chunkSize) => {
    const endIndex = Math.min(startIndex + chunkSize, uniqueImages.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      const imageUrl = uniqueImages[i];
      if (!this.preloadedImages.has(imageUrl)) {
        const img = new Image();
        img.onload = () => {
          this.preloadedImages.add(imageUrl);
          // If we've loaded all images in this chunk, start the next chunk
          if (i === endIndex - 1 && endIndex < uniqueImages.length) {
            setTimeout(() => {
              preloadChunk(endIndex, chunkSize);
            }, 100); // Small delay between chunks
          }
        };
        img.src = imageUrl;
      }
    }
  };
  
  // Start preloading in chunks of 5 images
  preloadChunk(0, 5);
  
  console.log(`Preloading ${uniqueImages.length} images in the background`);
}

  
   initializeEventListeners() {
    // Add apply button listener
    // const applyButton = document.querySelector('.apply-selection-button');
    // if (applyButton) {
    //   applyButton.addEventListener('click', () => {
    //     this.applySelection();
    //     applyButton.textContent = 'Added to Configuration';
    //     applyButton.disabled = true;
    //     // Only show remove button for optional components after applying selection
    //     const removeButton = document.querySelector('.remove-selection-button');
    //     if (removeButton && !this.selectedComponent.required) {
    //       removeButton.classList.remove('hidden');
    //     }
    //   });
    // }

    // Add remove button listener
    const removeButton = document.querySelector('.remove-selection-button');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        const component = this.components.find(c => c.handle === this.selectedComponent.handle);
        if (!component) return;
        
        this.removeComponentFromConfiguration(component);
        
        // Reset dropdowns
        const optionsGrid = document.querySelector('.options-grid');
        if (optionsGrid) {
          const selects = optionsGrid.querySelectorAll('select');
          selects.forEach(select => {
            select.value = '';
          });
        }

        // Update apply button state
        if (applyButton) {
          applyButton.classList.remove('hidden');
          applyButton.disabled = false;
          applyButton.textContent = 'Add to Configuration';
        }
      });
    }

    // Add event delegation for remove-optional buttons in configuration summary
    // Unified “remove any variant” handler
document.addEventListener('click', (e) => {
  // see if we clicked on a remove button (or child of one)
  const btn = e.target.closest('.remove-optional');
  if (!btn) return;

  // *** DEBUGGING ***
  console.log('🔥 remove-optional clicked!', {
    handle: btn.dataset.handle,
    variantId: btn.dataset.variantId
  });

  // now the real work
  const handle    = btn.dataset.handle;
  const variantId = parseInt(btn.dataset.variantId, 10);
  const current   = this.selectedVariants.get(handle) || [];
  const updated   = current.filter(v => v.id !== variantId);

  if (updated.length) {
    this.selectedVariants.set(handle, updated);
  } else {
    this.selectedVariants.delete(handle);
  }

  this.updateConfiguratorSummary();
  this.updateTotalPrice();
  this.updateAllComponentStatuses();
  this.evaluateConflicts();
});



    document.addEventListener('click', (e) => {
      const button = e.target.closest('.conflict-suggestion-button');
      if (!button) return;

      // 1. Find the parent component container
      const componentContainer = button.parentNode.closest('[data-component]');
      const isOptional = componentContainer?.dataset.component.includes('optional') || false;

      // 2. Get component handle and variant ID from button
      const compHandle = button.dataset.component;
      const variantId = parseInt(button.dataset.variantId, 10);

      // 3. Determine final component handle based on DOM context
      const targetHandle = isOptional ? `${compHandle}-optional` : compHandle;

      // 4. Select the correct component type
      this.selectComponent(targetHandle);

      // 5. Find base component (remove "-optional" suffix if present)
      const baseHandle = targetHandle.replace(/-optional$/, '');
      const comp = this.components.find(c => c.handle === baseHandle);
      if (!comp) return;

      // 6. Find the variant
      const variant = comp.variants.find(v => v.id === variantId);
      if (!variant) return;

      // 8. Apply selection with correct type
      this.selectedVariant = variant;
        this.applySelection();
    });
  }
initializeConfiguratorSummary() {
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'configuration-summary';

    // Create heading as a button for toggling
    const header = document.createElement('button');
    header.className = 'summary-header';
    header.setAttribute('aria-expanded', 'true');
    header.innerHTML = `
      <h2>Configuration Breakdown</h2>
      <svg class="chevron-icon" viewBox="0 0 24 24" width="24" height="24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
      </svg>
    `;

    // Collapsible Content (Only component selections)
    const content = document.createElement('div');
    content.className = 'summary-content';

    // Optional Components Section
    const optionalSection = document.createElement('div');
    optionalSection.className = 'summary-section optional-components';
    optionalSection.innerHTML = `
      <h3 class="summary-section__title">Components</h3>
      <div class="summary-items">
        <div class="summary-item optional-item">
          <div class="summary-item__content">
            <div class="summary-item__variant-row">
              <div class="summary-item__variant">None Selected</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Append to collapsible content
    content.appendChild(optionalSection);

    // Create Sticky Footer Section (Total + Add to Cart)
    const footerSection = document.createElement('div');
    footerSection.className = 'summary-footer';

    const totalSection = document.createElement('div');
    totalSection.className = 'summary-total';
    totalSection.innerHTML = `
      <div class="summary-total__title">Total</div>
      <div class="summary-total__price">${this.currencySymbol}0.00</div>
    `;

    const cartActions = document.createElement('div');
    cartActions.className = 'cart-actions';
    
    const addToCartButton = document.createElement('button');
    addToCartButton.type = 'button';
    addToCartButton.className = 'btn add-to-cart-button product-form__cart-submit disabled';
    addToCartButton.disabled = true;
    addToCartButton.textContent = `No Components Selected`;
    
    const viewCartLink = document.createElement('a');
    viewCartLink.href = '/cart';
    viewCartLink.className = 'view-cart-link';
    viewCartLink.textContent = 'View Cart →';

    cartActions.appendChild(addToCartButton);
    cartActions.appendChild(viewCartLink);

    footerSection.appendChild(totalSection);
    footerSection.appendChild(cartActions);

    // Append everything to summary container
    summaryContainer.appendChild(header);
    summaryContainer.appendChild(content);
    summaryContainer.appendChild(footerSection); // Footer remains outside accordion

    this.insertConfiguratorSummary(summaryContainer);

    // Toggle event
    header.addEventListener('click', () => {
      const isExpanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', !isExpanded);
      content.style.display = !isExpanded ? 'block' : 'none';
    });
}

initializeSpecsAccordion() {
  // Find the configurator-specs section
  const specsSection = document.querySelector('.configurator-specs');
  if (!specsSection) return;
  
  // Get the existing content
  const specsContent = specsSection.innerHTML;
  
  // Clear the section
  specsSection.innerHTML = '';
  
  // Create heading as a button for toggling
  const header = document.createElement('button');
  header.className = 'summary-header';
  header.setAttribute('aria-expanded', 'false'); // Closed by default
  header.innerHTML = `
    <h2>Specs</h2>
    <svg class="chevron-icon" viewBox="0 0 24 24" width="24" height="24">
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
    </svg>
  `;
  
  // Create content container
  const content = document.createElement('div');
  content.className = 'specs-content';
  content.style.display = 'none'; // Hidden by default
  
  // Extract the content excluding the h2 title
  const contentWithoutTitle = specsContent.replace(/<h2>Specs<\/h2>/, '').trim();
  content.innerHTML = contentWithoutTitle;
  
  // Append to specs section
  specsSection.appendChild(header);
  specsSection.appendChild(content);
  
  // Toggle event
  header.addEventListener('click', () => {
    const isExpanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', !isExpanded);
    content.style.display = !isExpanded ? 'block' : 'none';
  });
}

  insertConfiguratorSummary(summaryContainer) {
    const isMobile = window.innerWidth <= 768;
    const desktopParent = document.querySelector('.configurator__options'); // Default desktop location
    const mobileBottomBar = document.querySelector('.mobile-bottom-bar');
    if (!summaryContainer || !desktopParent || !mobileBottomBar) return;

    if (isMobile) {
        // Move configurator summary into the mobile bottom bar
        if (!mobileBottomBar.contains(summaryContainer)) {
            mobileBottomBar.insertBefore(summaryContainer, mobileBottomBar.firstChild);
        }
    } else {
        // Move configurator summary back to desktop position
        if (!desktopParent.contains(summaryContainer)) {
            // Find the configurator-specs element
            const specsElement = desktopParent.querySelector('.configurator-specs');
            
            // If specs element exists, insert summary before it
            if (specsElement) {
                desktopParent.insertBefore(summaryContainer, specsElement);
            } else {
                // Otherwise, just append to the end
                desktopParent.appendChild(summaryContainer);
            }
        }
    }
}

  initializeComponentTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const requiredGrid = document.getElementById('required-components');
    const optionalGrid = document.getElementById('optional-components');
    const components = document.querySelectorAll('.component-card');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Update active tab
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Show/hide grids
        if (button.dataset.tab === 'required') {
          requiredGrid.style.display = 'flex';
          optionalGrid.style.display = 'none';
        } else {
          requiredGrid.style.display = 'none';
          optionalGrid.style.display = 'flex';
          // Update visibility of extra components when switching to optional tab
          this.updateExtraComponents();
        }

        // Find first visible component in active grid
        const activeGrid = button.dataset.tab === 'required' ? requiredGrid : optionalGrid;
        const firstComponent = activeGrid.querySelector('.component-card:not([style*="display: none"])');
        if (firstComponent) {
          this.selectComponent(firstComponent.dataset.componentId, true);
        }
      });
    });

    // Initially hide optional grid
    optionalGrid.style.display = 'none';
    
    // Initially hide extra components
    this.updateExtraComponents();
  }
  //#endregion
  
  //#region UI and Component Management
  setupComponentCards() {
    document.querySelectorAll('.component-card').forEach(card => {
      const componentId = card.dataset.componentId;
      
      // Store initial image state
      const mobileImage = card.querySelector('.component-card__mobile .component-card__image');
      const desktopImage = card.querySelector('.component-card__desktop .component-card__image');
      
      this.initialImages.set(componentId, {
        mobile: mobileImage?.src,
        desktop: desktopImage?.src
      });

      // Set up visibility toggle
      const visibilityToggles = card.querySelectorAll('.visibility-toggle');
      visibilityToggles.forEach(visibilityToggle => {
        visibilityToggle.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const layerImage = document.getElementById(`layer-${componentId}`);
          const eyeVisible = visibilityToggle.querySelector('.eye-visible');
          const eyeHidden = visibilityToggle.querySelector('.eye-hidden');
          
          if (layerImage && eyeVisible && eyeHidden) {
            const isVisible = !layerImage.classList.contains('hidden');
            
            // Toggle layer visibility and icon states
            if (isVisible) {
              // Hide the layer and show the crossed-out eye
              layerImage.classList.add('hidden');
              eyeVisible.classList.add('hidden');
              eyeHidden.classList.remove('hidden');
            } else {
              // Show the layer and show the normal eye
              layerImage.classList.remove('hidden');
              eyeVisible.classList.remove('hidden');
              eyeHidden.classList.add('hidden');
            }
          }
        });

        // Set initial state
        const layerImage = document.getElementById(`layer-${componentId}`);
        const eyeVisible = visibilityToggle.querySelector('.eye-visible');
        const eyeHidden = visibilityToggle.querySelector('.eye-hidden');
        
        if (layerImage && eyeVisible && eyeHidden) {
          const isVisible = !layerImage.classList.contains('hidden');
          eyeVisible.classList.toggle('hidden', !isVisible);
          eyeHidden.classList.toggle('hidden', isVisible);
        }
      });

      card.addEventListener('click', (event) => {
        if (card.classList.contains('locked')) return;
        this.handleComponentClick(card.dataset.componentId);
      });
    });

    // Note: Apply button click handler is now managed in initializeEventListeners
    // to avoid duplicate event listeners
  }
  handleComponentClick(component) {
      // Simply delegate to selectComponent which already handles all the necessary logic
      this.selectComponent(component);
}

selectComponent(handle, force = false) {
    // Check if the component is already selected, if so, ignore the click unless forced
    if (!force && this.selectedComponent && this.selectedComponent.handle === handle.replace(/-optional$/, '')) {
        return;
    }

    // Store the original handle (with -optional if present)
    const originalHandle = handle;
    const baseHandle = handle.replace(/-optional$/, '');

    // Reset visuals for previous selection
    if (this.selectedComponent) {
        const previousHandle = this.selectedComponent.isOptionalSelection 
            ? `${this.selectedComponent.handle}-optional` 
            : this.selectedComponent.handle;
        const previousCard = document.querySelector(`.component-card[data-component-id="${previousHandle}"]`);

        if (previousCard) {
            previousCard.classList.remove('selected');
        }
    }
  
    document.querySelectorAll('.component-card').forEach(card => {
        card.classList.remove('selected');
    });

    // **Find the new selected component**
    this.selectedComponent = this.components.find(c => c.handle === baseHandle);
    if (!this.selectedComponent) return;

    // Store whether this is an optional selection
    this.selectedComponent.isOptionalSelection = originalHandle.endsWith('-optional');

    // **Visually select the new component card**
    const selectedCard = document.querySelector(`.component-card[data-component-id="${originalHandle}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
        selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // **Restore missing UI updates:**
    // Update navigation title
    const titleElement = document.querySelector('.selected-component-title');
    if (titleElement) {
        titleElement.textContent = this.formatComponentTitle(
            this.selectedComponent.title, 
            this.selectedComponent.isOptionalSelection,
            this.selectedComponent.required
        );
    }

    // Update navigation image - RESET TO BLUEPRINT FIRST
    const navigationImage = document.querySelector('.component-navigation__image');
    if (navigationImage) {
        // Reset to blueprint image first to avoid showing the previous component's variant image
        navigationImage.src = this.selectedComponent.blueprint || selectedCard?.querySelector('.component-card__image')?.src;
    }

    // **Restore missing function calls**
    this.updateNavigationButtons(); // Previously removed, now restored

    // **Update dropdowns and options with a delay to ensure proper sequence**
    if (this.checkIsMobile()) {
      // First update the options grid to reset dropdowns
      this.updateOptionsGrid("carousel");
      
      // Then update the selected variant after a small delay
      setTimeout(() => {
        this.updateSelectedVariant("carousel");
      }, 250); // Slightly longer than the 200ms delay in updateOptionsGrid
    } else {
      // First update the options grid to reset dropdowns
      this.updateOptionsGrid("desktop");
      
      // Then update the selected variant after a small delay
      setTimeout(() => {
        this.updateSelectedVariant("desktop");
      }, 250); // Slightly longer than the 200ms delay in updateOptionsGrid
    }
}

  setupRemoveButton() {
    const removeButton = document.querySelector('.remove-selection-button');
    if (!removeButton) return;

    removeButton.addEventListener('click', () => {
      const component = this.components.find(c => c.handle === this.selectedComponent);
      if (!component) return;
      
      this.removeComponentFromConfiguration(component);
      
      // Reset dropdowns
      const optionsGrid = document.querySelector('.options-grid');
      if (optionsGrid) {
        const selects = optionsGrid.querySelectorAll('select');
        selects.forEach(select => {
          select.value = '';
        });
      }

      // Update apply button state
      const applyButton = document.querySelector('.apply-selection-button');
      if (applyButton) {
        applyButton.classList.remove('hidden');
        applyButton.disabled = false;
        applyButton.textContent = 'Apply to Configuration';
      }
    });
  }
  getAvailableOptionsForPosition(position, selectedValues, context = "desktop") {
  // If no component or variants are loaded, bail out.
  if (!this.selectedComponent || !this.selectedComponent.variants) {
    return [];
  }

  const totalPositions = this.selectedComponent.options.length;
  // 1) Gather all variants that match previously selected dropdowns.
  let compatibleVariants = this.selectedComponent.variants;
  if (position > 1) {
    // Build a map of previously selected values, ignoring appended text.
    const previousValues = new Map();
    for (let i = 1; i < position; i++) {
      const val = selectedValues.get(i);
      if (!val) {
        // Missing a previous selection => no valid set yet.
        return [];
      }
      // Remove possible appended price info or SOLD OUT text.
      previousValues.set(
        i,
        val
          .replace(/ - SOLD OUT$/, '')
          .replace(/ - \$[\d.,]+( - \$[\d.,]+)?/, '')
      );
    }

    // Filter compatible variants by these previous selections.
    compatibleVariants = compatibleVariants.filter((variant) => {
      const parts = variant.title.split(' / ');
      // Each previously selected option must match the corresponding part in the variant.
      return Array.from(previousValues.entries()).every(([pos, optValue]) => {
        return parts[pos - 1] === optValue;
      });
    });
  }

  // 2) Identify all unique option values for the current position
  const optionsMap = new Map();

  compatibleVariants.forEach((variant) => {
    const variantOptions = variant.title.split(' / ');
    const currentOptionValue = variantOptions[position - 1];
    if (!currentOptionValue) return;

    if (optionsMap.has(currentOptionValue)) {
      return;
    }

    // Among all matching variants, find price ranges & availability
    const matchingAll = compatibleVariants.filter((mv) => {
      const parts = mv.title.split(' / ');
      return parts[position - 1] === currentOptionValue;
    });
    const pricesAll = matchingAll.map((mv) => mv.price);
    const minPriceAll = Math.min(...pricesAll);
    const maxPriceAll = Math.max(...pricesAll);

    const allSoldOut = matchingAll.every((mv) => !mv.available);

    let labelText = currentOptionValue;
    if (minPriceAll === maxPriceAll) {
      // Single price
      labelText += ` - ${this.currencySymbol}${(minPriceAll / 100).toFixed(2)}`;
    } else {
      // Range of prices
      labelText += ` - ${this.currencySymbol}${(minPriceAll / 100).toFixed(2)} - ${this.currencySymbol}${(maxPriceAll / 100).toFixed(2)}`;
    }

    if (allSoldOut) {
      labelText += ' - SOLD OUT';
    }

    optionsMap.set(currentOptionValue, labelText);
  });

    const availableOptions = Array.from(optionsMap.values());
    if (availableOptions.length === 0) {
      return [];
    }
    // 3) Auto-select if there's only one possibility
    if (availableOptions.length === 1) {
      setTimeout(() => {
        // Choose the correct selector based on context
        const selector =
          context === 'desktop'
            ? `.option-select[data-position="${position}"]`
            : `.mobile-option-select[data-position="${position}"]`;
        const select = document.querySelector(selector);
        if (select) {
          const rawValue = availableOptions[0].split(' - ')[0];
          if (select.value !== rawValue) {
            select.value = rawValue;
            select.dispatchEvent(new Event('change'));
          }
        }
      }, 0);
    }

  return availableOptions;
  }

  updateOptionsGrid(context = "desktop") {
    const container = context === "desktop"
        ? document.querySelector('.options-grid')
        : document.querySelector('.mobile-carousel-track .mobile-component-card.active .mobile-card-options');
    if (!container) return;

    container.classList.remove('active');
    
    setTimeout(() => {
        this.updateOptionsContent(container, context);
        requestAnimationFrame(() => {
            container.classList.add('active');
        });

        // **Auto-select dropdowns with only one option**
        container.querySelectorAll("select").forEach((dropdown) => {
            if (dropdown.options.length === 2) {
                dropdown.selectedIndex = 1;
                dropdown.dispatchEvent(new Event("change"));
            }
        });
    }, 200);
  }
updateOptionsContent(container, context = "desktop") {
  container.innerHTML = '';
  const selectedValues = new Map();

  if (!this.selectedComponent || !this.selectedComponent.options) return;

  const optionsContainer = document.querySelector('.options-container');
  if (!optionsContainer) return;

  // Update title (found inside the optionsContainer)
  const titleElement = optionsContainer.querySelector('.options-title');
  if (titleElement) {
      titleElement.textContent = this.formatComponentTitle(
          this.selectedComponent.title, 
          this.selectedComponent.isOptionalSelection,
          this.selectedComponent.required
      );
  }

  // Create dropdowns for options
  this.selectedComponent.options.forEach((option, index) => {
      const position = index + 1;
      const optionContainer = document.createElement('div');
      optionContainer.className = 'option-container';

      const label = document.createElement('label');
      label.textContent = option.name;

      const select = document.createElement('select');
      select.className = context === "desktop" ? "option-select" : "mobile-option-select";
      select.dataset.optionName = this.handleize(option.name);
      select.dataset.position = position;

      // Default "Select" option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = `Select ${option.name}`;
      defaultOption.disabled = true;
      defaultOption.selected = true;
      select.appendChild(defaultOption);

      // Populate available values
      const availableValues = this.getAvailableOptionsForPosition(position, selectedValues, context);
      availableValues.forEach(value => {
          const optionElement = document.createElement('option');
          optionElement.value = value.split(' - ')[0];
          optionElement.textContent = value;
          select.appendChild(optionElement);
      });
    
      // Restore previous selection if applicable
      const savedVariant = this.selectedVariants.get(this.selectedComponent.handle);
      if (savedVariant && !this.selectedComponent.isOptionalSelection) {
          const optionValues = this.parseVariantTitle(savedVariant.title);
          const optionValue = optionValues[position - 1];
          if (optionValue) {
              select.value = optionValue;
              selectedValues.set(position, optionValue);
          }
      }

      // Add event listener for changes
      select.addEventListener("change", (event) => this.handleVariantChange(event, context));
      
      optionContainer.appendChild(label);
      optionContainer.appendChild(select);
      container.appendChild(optionContainer);
  });

  // (Optional) For mobile, you might want to call handleDropDownAvailability here:
  if (context !== "desktop" && this.checkIsMobile()) {
    this.handleDropDownAvailability(container);
  }

  // NEW: Restore "Add to Configuration" button for optional components
  if (this.preorderStatus === 'live') {
      const applyButton = document.createElement("button");
      applyButton.textContent = "Add to Configuration";
      applyButton.className = "apply-selection-button";

      const selectedOptions = Array.from(container.querySelectorAll('select')).map(select => select.value);
      applyButton.disabled = !this.isValidVariant(selectedOptions);

      applyButton.addEventListener("click", () => {
          if (this.checkIsMobile()) {
              const card = container.closest('.mobile-component-card');
              this.applySelection(applyButton, card);
          } else {
              this.applySelection(applyButton, container);
          }
          applyButton.textContent = "Add to configuration";
      });
      container.appendChild(applyButton);
  }
}
  
  /**
 * Given an array of selected option values (from your dropdowns),
 * returns the matching variant from the currently selected component.
 * Returns null if no matching variant is found.
 */
getMatchingVariantFromSelections(selectedOptions) {
  if (!this.selectedComponent) return null;

  // Loop through all variants for the selected component.
  return this.selectedComponent.variants.find(variant => {
    // Split the variant's title into its parts.
    // (Assuming the variant title is in the form "Option1 / Option2 / Option3" and may contain appended info like " - SOLD OUT")
    const variantOptions = variant.title
      .split(' / ')
      .map(opt => opt.trim().toLowerCase().replace(/ - sold out$/i, ''));

    // If the number of options differs, it's not a match.
    if (variantOptions.length !== selectedOptions.length) return false;

    // Check if every option in the variant matches the corresponding selected option.
    return selectedOptions.every((sel, index) => {
      // Compare both strings in lowercase and trimmed.
      return sel.trim().toLowerCase() === variantOptions[index];
    });
  }) || null;
}

  /**
   * Checks if the given set of selected options corresponds to a valid variant.
   * A valid variant is one that exists as a variant for the currently selected component.
   * @param {string[]} selectedOptions - An array of selected options; each option is the value of a select element.
   * @returns {boolean} true if the given options correspond to a valid variant; false otherwise.
   */

  isValidVariant(selectedOptions) {
  return !!this.getMatchingVariantFromSelections(selectedOptions);
}
  resetOptionsContent(container) {
  // Reset all select elements to their default option.
  const selects = container.querySelectorAll('select');
  selects.forEach(select => {
    select.selectedIndex = 0; // Resets to "Select ..." option.
  });

  // **Ensure the button is also reset**
  const applyButton = container.querySelector('.apply-selection-button');
  if (applyButton) {
    applyButton.textContent = "Add to Configuration";
    applyButton.disabled = true;
  }
}

  handleDropDownAvailability(container) {
    const previousSibling = container.previousElementSibling;
    if (previousSibling && previousSibling.classList.contains('locked')) {
      container.querySelectorAll('select, input, button.apply-selection-button')
        .forEach(el => {
          el.disabled = true;
        });
    } else {
      container.querySelectorAll('select, input, button.apply-selection-button')
        .forEach(el => {
          el.disabled = false;
        });
    }
  }
  updateConfiguratorSummary() {
  const componentsList = document.querySelector('.optional-components .summary-items');
  if (!componentsList) return;

  let html = '';

  // Loop per component handle
  this.selectedVariants.forEach((variants, handle) => {
    const component = this.components.find(c => c.handle === handle.replace(/-optional$/, ''));
    if (!component) return;

    // Normalize to array
    const variantsArray = Array.isArray(variants) ? variants : [variants];

    // Start one block per component
    html += `
      <div class="summary-item optional-item" data-component="${handle}">
        <div class="summary-item__content">
          <h4 class="summary-item__title">
            ${this.formatComponentTitle(component.title)}
          </h4>
    `;

    // Then one row per variant
    variantsArray.forEach(variant => {
      const qty = variant.quantity || 1;
      const price = (variant.price * qty / 100).toFixed(2);
      const soldOutClass = variant.available ? '' : ' icon-sold-out';
      html += `
          <div class="summary-item__variant-row" data-variant-id="${variant.id}">
            <div class="summary-item__variant">
              ${variant.title}
              ${!variant.available ? `<span class="material-symbols-outlined${soldOutClass}">error</span>` : ''}
            </div>
            <div class="summary-item__price-group">
              <input type="number" class="variant-quantity" value="${qty}" min="1" data-handle="${handle}" data-variant-id="${variant.id}" ${!variant.available ? 'disabled' : ''}>
              <div class="summary-item__price">${this.currencySymbol}${price}</div>
              <button class="remove-optional" data-handle="${component.handle}" data-variant-id="${variant.id}">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </div>
          </div>
      `;
    });

    // Close component block
    html += `
        </div>
      </div>
    `;
  });

  componentsList.innerHTML = html;

  
  componentsList.querySelectorAll('.variant-quantity').forEach(input =>
    input.addEventListener('change', e => this.handleQuantityChange(e))
  );

  this.updateTotalPrice();
}

  removeComponent(handle, variantId) {
    const variant = this.selectedVariants.get(handle);
    if (!variant) return;

    if (variant.id === variantId) {
      this.selectedVariants.delete(handle);
      this.updateConfiguratorSummary();
      this.updateTotalPrice();
      this.evaluateConflicts();
    }
  }

  updateTotalPrice() {
    const summaryContainer = document.querySelector('.configuration-summary');
    if (!summaryContainer) return;

    let total = 0;
    this.selectedVariants.forEach((variants, handle) => {
      const variantsArray = Array.isArray(variants) ? variants : [variants];
      variantsArray.forEach(variant => {
        const quantity = variant.quantity || 1;
        total += variant.price * quantity;
      });
    });

    const totalElement = summaryContainer.querySelector('.summary-total__price');
    if (totalElement) {
      totalElement.textContent = `${this.currencySymbol}${(total / 100).toFixed(2)}`;
    }

    const hasItems = total > 0;
    if (summaryContainer.classList.contains('has-items') !== hasItems) {
      summaryContainer.classList.toggle('has-items', hasItems);
    }
  }
  updateUI(variant) {
    if (!variant || !this.selectedComponent) return;

    const buttonContainer = document.querySelector('.button-container');
    if (!buttonContainer) return;

    const addButton = buttonContainer.querySelector('.add-to-configuration');
    const quantityInput = document.getElementById('option-quantity');

    // Only proceed with button/quantity updates if they exist
    if (addButton) {
      if (variant.available) {
        addButton.disabled = false;
        addButton.classList.remove('hidden');
        if (quantityInput) {
          quantityInput.value = 1;
        }
      } else {
        addButton.disabled = true;
        addButton.classList.add('hidden');
      }

      // Update button text based on component type
      const buttonText = this.selectedComponent.required ? 'Select' : 'Add to Configuration';
      addButton.textContent = buttonText;
    }

    // Get the image URL from the variant
    const imageUrl = variant.featured_image?.src || variant.featured_image || this.selectedComponent.featured_image;
    if (!imageUrl) return;

    // Get the handle to use for UI updates
    const uiHandle = this.selectedComponent.isOptionalSelection ? 
      `${this.selectedComponent.handle}-optional` : 
      this.selectedComponent.handle;

    // For optional components, only update navigation image during selection
    // Card images will stay as blueprint
    const isOptionalComponent = this.selectedComponent.isOptionalSelection;

    // Update card images only for required components
    var card = null;
    if (!isOptionalComponent)
      card = document.querySelector(`.component-card[data-component-id="${this.selectedComponent.handle}"]`);
    else
      card = document.querySelector(`.component-card[data-component-id="${this.selectedComponent.handle}-optional"]`);
    if (card) {
      // Update desktop view image
      if ((!isOptionalComponent && !this.checkIsMobile()) || this.checkIsMobile()) {
        const desktopImage = card.querySelector('.component-card__desktop .component-card__image');
        if (desktopImage) {
          desktopImage.src = imageUrl;
        }
        // add variant id to as a data attribute
        card.dataset.variantId = variant.id;
        // Update option flags
          const optionFlags = card.querySelectorAll('.option-flag');
          optionFlags.forEach((flag, index) => {
            const optionName = flag.dataset.option;
            if (!optionName) return;

            // Map option index (Material = option1, Color = option2, etc.)
            const optionMapping = ["option1", "option2", "option3"]; // Shopify uses option1, option2, option3
            const selectedOptionValue = variant[optionMapping[index]]; // Get the corresponding option value

            if (selectedOptionValue) {
              flag.textContent = selectedOptionValue;
              flag.classList.add('selected');
            }
          });
      }
            //udate navigation image
            const navigationImage = document.querySelector('.component-navigation__image');
            if (navigationImage) {
              navigationImage.src = imageUrl;
              navigationImage.classList.remove('loading');
            }
      }

    // Update layer image only for required components
    if (!isOptionalComponent) {
      const layerId = `layer-${this.selectedComponent.handle}`;
      const layerImage = document.getElementById(layerId);
      if (layerImage) {
        // Use layer_image if it exists, otherwise fall back to the regular variant image
        const layerImageUrl = variant.layer_image || imageUrl;
        layerImage.src = layerImageUrl;
        layerImage.classList.add('visible');
      }
    }

    // Store this as the initial state only for required components
    if (!isOptionalComponent) {
      this.initialImages.set(uiHandle, {
        mobile: imageUrl,
        desktop: imageUrl
      });
    }
  }

applyConfig() {
  const configuratorCards = document.querySelectorAll('.component-card');
  
  configuratorCards.forEach(card => {
    if (!card.dataset.variantId) return;
    
    // Find matching card in parts tab
    const partsCard = document.querySelector(`.component-card[data-component-handle="${card.dataset.componentHandle}"]`);
    if (!partsCard) return;
    
    // Set it as selected component
    this.selectedComponent = this.components.find(c => c.handle === card.dataset.componentHandle);
    if (!this.selectedComponent) return;
    
    // Set the variant
    this.selectedVariant = this.selectedComponent.variants.find(v => v.id === parseInt(card.dataset.variantId));
    if (!this.selectedVariant) return;
    
    // Apply the selection
    this.applySelection(null, { closest: () => partsCard });
  });
}
  applySelection(applyButton, container) {
  if (this.preorderStatus && this.preorderStatus !== 'live') return;
  if (!this.selectedComponent || !this.selectedVariant) return;

  const handle = this.selectedComponent.handle;
  const quantityInput = document.getElementById('option-quantity');
  const newQuantity = parseInt(quantityInput?.value) || 1;

  // Get the existing list (or start a new one)
  const existing = this.selectedVariants.get(handle);
  const list = Array.isArray(existing) ? existing : (existing ? [existing] : []);

  // Look for the same variant ID
  const match = list.find(v => v.id === this.selectedVariant.id);
  if (match) {
    // already in list → bump its quantity
    match.quantity = (match.quantity || 0) + newQuantity;
  } else {
    // new variant → push to list
    list.push({ ...this.selectedVariant, quantity: newQuantity });
  }

  // Save back
  this.selectedVariants.set(handle, list);

  // Rest of the flow stays the same
  this.updateAllComponentStatuses();
  this.updateConfiguratorSummary();
  this.updateTotalPrice();
  this.evaluateConflicts();

  if (this.selectedVariant.available) {
    this.showToast(`${this.selectedComponent.title} added successfully`, 'success');
  } else {
    this.showToast('Sold out', 'error');
  }
}


  updateComponentStatus(componentHandle, variant) {
    const card = document.querySelector(`.component-card[data-component-id="${componentHandle}"]`);
    if (!card) return;
    
    const component = this.components.find(c => c.handle === componentHandle.replace(/-optional$/, ''));
    if (!component) return;
    
    const statusBadge = card.querySelector('.status-badge');
    if (statusBadge) {
      if (variant || this.selectedVariants.has(componentHandle)) {
        statusBadge.classList.remove('hidden');

        const currentVariant = variant || this.selectedVariants.get(componentHandle);
        const isSoldOut = currentVariant && !currentVariant.available;

        if (!isSoldOut) {
          card.classList.add('configured');
        } else {
          card.classList.remove('configured');
        }
        // Update add to cart button state
        const addToCartButton = document.querySelector('.add-to-cart-button');
        if (addToCartButton) {
          
          // Check for sold out variants, handling both single variants and arrays
          const hasSoldOutVariants = Array.from(this.selectedVariants.entries()).some(([handle, variants]) => {
            
            // Convert to array if not already
            const variantArray = Array.isArray(variants) ? variants : [variants];
            
            // Check if any variant in the array is unavailable
            const isSoldOut = variantArray.some(v => {
              return !v?.available;
            });
            
            return isSoldOut;
          });

          
          if (this.getCompletedRequiredCount() >= this.totalRequiredComponents && !hasSoldOutVariants) {
            addToCartButton.classList.remove('disabled');
            addToCartButton.disabled = false;
            addToCartButton.textContent = 'Add to Cart';
          } else {
            addToCartButton.classList.add('disabled');
            addToCartButton.disabled = true;
            addToCartButton.textContent = hasSoldOutVariants ? 
              'Contains Sold Out Items' : 
              `${this.getCompletedRequiredCount()} / ${this.totalRequiredComponents} Components Selected`;
          }
        }
      } else {
        if (!component.required && componentHandle.endsWith('-optional')) {
          statusBadge.classList.add('hidden');
      }
        card.classList.remove('configured');
      }
    }
    // If this is a required component, update extra components visibility
    if (!componentHandle.endsWith('-optional')) {
      // Update layer image
      const layerId = `layer-${component.handle}`;
      const layerImage = document.getElementById(layerId);
      if (layerImage) {
        if (variant || this.selectedVariants.has(componentHandle)) {
          layerImage.classList.add('visible');
          if (variant) {
            layerImage.src = variant.featured_image || component.featured_image;
          }
        } else {
          layerImage.classList.remove('visible');
        }
      }
      this.updateExtraComponents();
    }
  }
    

getCompletedRequiredCount() {
  return this.components.reduce((count, component) => {
    // Only count required components that have a valid selection in selectedVariants
    if (component.required && this.selectedVariants.has(component.handle)) {
      return count + 1;
    }
    return count;
  }, 0);
}

updateAllComponentStatuses() {
  this.components.forEach((component) => {
    const handle = component.handle;
    const optionalHandle = `${handle}-optional`;

    // Update status for required or optional selections
    if (this.selectedVariants.has(handle)) {
      this.updateComponentStatus(handle);
    } else if (this.selectedVariants.has(optionalHandle)) {
      this.updateComponentStatus(optionalHandle);
    } else {
      this.updateComponentStatus(handle);
    }
  });

  // Update the completed count and sync it with the instance variable
  const completedCount = this.getCompletedRequiredCount();
  this.completedRequiredComponents = completedCount;
    
    
  // Re-check conflicts (if necessary)
  this.evaluateConflicts();
  }
  updateSelectedVariant(context = "desktop") {
    if (!this.selectedComponent) return null;

    // Select dropdowns based on context
    const dropdowns = context === "desktop"
        ? document.querySelectorAll('.options-grid .option-select')
        : document.querySelectorAll('.mobile-component-card.active .mobile-option-select');

    // Gather current selected values from dropdowns (ignoring empty selections)
    const selectedOptions = Array.from(dropdowns)
        .map(select => select.value)
        .filter(val => val !== '');

    // Determine the container that holds the apply button.
    // For desktop, assume the container is the .options-grid; for mobile, it is within the active mobile card.
    let container;
    if (context === "desktop") {
      container = document.querySelector('.options-grid');
    } else {
      container = document.querySelector('.mobile-component-card.active .mobile-card-options');
    }

    // If not all options are selected, disable the apply button and exit.
    if (selectedOptions.length !== this.selectedComponent.options.length) {
      if (container) {
        const applyButton = container.querySelector('.apply-selection-button');
        if (applyButton) {
          applyButton.disabled = true;
        }
      }
      return null;
    }

    // Use a reusable helper to get the matching variant.
    // (Assuming you have a function getMatchingVariantFromSelections(selectedOptions) that returns a variant or null)
    const matchingVariant = this.getMatchingVariantFromSelections(selectedOptions);

    // Update the apply button state based on whether a valid variant was found.
    if (container) {
      const applyButton = container.querySelector('.apply-selection-button');
      if (applyButton) {
        applyButton.disabled = matchingVariant ? false : true;
      }
    }

    // If a valid variant was found, update the UI accordingly.
    if (matchingVariant) {
      this.selectedVariant = matchingVariant;
      this.updateUI(matchingVariant);
    }

    return matchingVariant;
}

  handleVariantChange(event, context = "desktop") {
      const select = event.target;
      const position = parseInt(select.dataset.position, 10);
      const selectedValue = select.value;
    const selectedValues = new Map();

      // Update selected values based on all dropdowns in this context
      const dropdowns = context === "desktop"
          ? document.querySelectorAll('.options-grid .option-select')
          : document.querySelectorAll('.mobile-component-card.active .mobile-option-select');

      dropdowns.forEach((dropdown, index) => {
          if (dropdown.value) {
              selectedValues.set(index + 1, dropdown.value);
          }
      });

      // Clear all subsequent dropdowns
      dropdowns.forEach((dropdown) => {
          const dropdownPosition = parseInt(dropdown.dataset.position, 10);
          if (dropdownPosition > position) {
              dropdown.innerHTML = ''; // Reset dropdown options
              const defaultOption = document.createElement('option');
              defaultOption.value = '';
              defaultOption.textContent = `Select ${dropdown.dataset.optionName}`;
              defaultOption.disabled = true;
              defaultOption.selected = true;
              dropdown.appendChild(defaultOption);
          }
      });

      // **Get available options for the next dropdown**
      const nextPosition = position + 1;
      const availableOptions = this.getAvailableOptionsForPosition(nextPosition, selectedValues, context);

      // **Populate next dropdown**
      const nextDropdown = [...dropdowns].find(dropdown => parseInt(dropdown.dataset.position) === nextPosition);
      if (nextDropdown) {
          availableOptions.forEach(value => {
              const optionElement = document.createElement('option');
              optionElement.value = value.split(' - ')[0]; // Extract raw name
              optionElement.textContent = value; // Keep full label
              nextDropdown.appendChild(optionElement);
          });
      }

      // Find matching variant
      const variant = this.updateSelectedVariant(context);
      if (variant) {
      this.selectedVariant = variant;
          // For optional/add-on components, enable the "Add to Configuration" button.
          if (context === "carousel") {
              const parentCard = event.target.closest('.mobile-component-card');
              if (parentCard) {
                  const applyButton = parentCard.querySelector('.apply-selection-button');
                  if (applyButton) {
                      applyButton.disabled = false;
                  }
              }
          }
      } else {
          // If no valid variant and the component is optional, disable the button.
          if (!this.selectedComponent.required && context === "carousel") {
              const parentCard = event.target.closest('.mobile-component-card');
              if (parentCard) {
                  const applyButton = parentCard.querySelector('.apply-selection-button');
                  if (applyButton) {
                      applyButton.disabled = true;
                  }
              }
          }
      }
  }
  removeComponentFromConfiguration(component) {
    const handle = component.isOptionalSelection
      ? `${component.handle}-optional`
      : component.handle;

    this.selectedVariants.delete(handle);
    this.updateAllComponentStatuses();
    this.updateConfiguratorSummary();

    // Call evaluateConflicts to re-check the button state
    this.evaluateConflicts();

    // Show toast notification
    this.showToast(`${component.title} removed`, 'info');
    this.resetComponentCard(component);
  }
    /**
   * Mobile handler for when a user changes any <select> dropdown in a component card.
   * It reuses your existing logic: find the variant, set `this.selectedVariant`,
   * and call `applySelection()` just like on desktop.
   *
   * @param {Event} e          The change event object (from a <select>)
   * @param {Object} component The "component" object (with .variants, .options, etc.)
   */
  updateExtraComponents() {
    // Get all extra components
    const extraComponents = document.querySelectorAll('.component-card[data-component-id$="-optional"]');
    const optionalGrid = document.getElementById('optional-components');
    
    // First pass: identify add-ons and extras
    const addOns = [];
    
    extraComponents.forEach(extraCard => {
      addOns.push(extraCard);
    });
    
    if (!this.checkIsMobile()) {
      // Add back to DOM in correct order
    addOns.forEach(card => {
      optionalGrid.appendChild(card);
    });
    }

    // Update the extra components container with selected variants
    const extraComponentsContainer = document.querySelector('.extra-components');
    if (!extraComponentsContainer) return;

    let extraComponentsHtml = '';
    this.selectedVariants.forEach((variants, handle) => {
      // Skip non-optional components
      if (!handle.endsWith('-optional')) {
        return;
      }
      
      // Get the base handle without the -optional suffix
      const baseHandle = handle.replace('-optional', '');
      const component = this.components.find(c => c.handle === baseHandle);
      if (!component) {
        return;
      }

      extraComponentsHtml += `
        <div class="extra-component">
          <h3 class="extra-component-title">${component.title}</h3>
          <div class="optional-variants-list">
      `;

      // Ensure variants is always an array
      const variantsArray = Array.isArray(variants) ? variants : [variants];
      
      variantsArray.forEach(variant => {
        const quantity = variant.quantity || 1;
        const variantPrice = variant.price * quantity;
        
        extraComponentsHtml += `
          <div class="optional-variant-row">
            <div class="optional-variant-info">
              ${variant.title}
              <button class="remove-optional" data-handle="${baseHandle}" data-variant-id="${variant.id}">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </div>
            <div class="optional-variant-price-group">
              <div class="quantity-input">
                <span class="quantity-prefix">x</span><input 
                  type="number" 
                  class="variant-quantity" 
                  value="${quantity}"
                  min="1"
                  data-handle="${baseHandle}"
                  data-variant-id="${variant.id}"
                  ${variant.available ? '' : 'disabled'}
                >
              </div>
              <div class="optional-variant-price">${this.currencySymbol}${(variantPrice / 100).toFixed(2)}</div>
            </div>
          </div>
        `;
      });

      extraComponentsHtml += `
          </div>
        </div>
      `;
    });

    extraComponentsContainer.innerHTML = extraComponentsHtml;
  }
handleQuantityChange(e) {
  const input = e.target;
  const handle = input.dataset.handle;                      // ← plain handle
  const variantId = parseInt(input.dataset.variantId, 10);
  const newQuantity = Math.max(1, parseInt(input.value, 10) || 1);

  // Pull the array (or singleton) directly from the map by handle
  const existing = this.selectedVariants.get(handle);
  if (!existing) return;
  const variants = Array.isArray(existing) ? existing : [existing];

  // Find and update the right variant
  const v = variants.find(x => x.id === variantId);
  if (!v) return;
  v.quantity = newQuantity;

  // Put it back in the map
  this.selectedVariants.set(handle, variants);

  // Update the line‐item price in the DOM
  const priceEl = input.closest('.summary-item__price-group')
                      .querySelector('.summary-item__price');
  if (priceEl) {
    priceEl.textContent = 
      `${this.currencySymbol}${(v.price * newQuantity / 100).toFixed(2)}`;
  }

  // Recompute total & conflicts
  this.updateTotalPrice();
  this.evaluateConflicts();
}

  updateOptionFlags(card, dropdowns, resetToDefault = false) {
    if (!card) return;

    const optionFlags = card.querySelectorAll('.option-flag');
    optionFlags.forEach(flag => {
      const optionName = flag.dataset.option;
      if (!optionName) return;
      
      if (resetToDefault) {
        // Find the original option name from the component's options
        const originalOption = this.selectedComponent?.options?.find(opt => 
          opt && opt.name && optionName && 
          opt.name.toLowerCase() === optionName.toLowerCase()
        );

        if (originalOption) {
          flag.textContent = originalOption.name;
        }
      } else {
        // Find corresponding dropdown and update with its value if it exists
        const dropdown = Array.from(dropdowns).find(select => 
          select && select.dataset.optionName && 
          select.dataset.optionName === optionName
        );
        if (dropdown && dropdown.value) {
          flag.textContent = dropdown.value;
        }
      }
    });
  }
  //#endregion
  
  //#region Responsive Layout
  setupResponsiveListener() {
    let resizeTimeout;

    window.addEventListener('resize', () => {
        // If already scrolling, ignore this resize event
        if (isScrolling) {
            return;
        }

        clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
            const currentIsMobile = this.checkIsMobile();
          // Refresh page if crossing the mobile/desktop threshold
          if (this.initialIsMobile && !currentIsMobile || !this.initialIsMobile && currentIsMobile) {
            window.location.reload();
          }
        
            if (this.checkIsMobile()) {
                this.restoreMobileLayout();
            } else {
                this.restoreDesktopLayout();
            }

            const summaryContainer = document.querySelector('.configuration-summary');
            if (summaryContainer) {
                this.insertConfiguratorSummary(summaryContainer);
            }
        }, 150); // Delay execution to prevent excessive calls
    });

    // Initial check on page load
    if (this.checkIsMobile()) {
        this.restoreMobileLayout();
    } else {
        this.restoreDesktopLayout();
    }

    const summaryContainer = document.querySelector('.configuration-summary');
    if (summaryContainer) {
        this.insertConfiguratorSummary(summaryContainer);
    }
  }
  restoreDesktopLayout() {

    // 1. Move summary back to the desktop parent
    const configuratorSummaryParent = document.querySelector('.configurator__options');
    const summaryContainer = document.querySelector('.configuration-summary');
    if (summaryContainer && configuratorSummaryParent && !configuratorSummaryParent.contains(summaryContainer)) {
      configuratorSummaryParent.appendChild(summaryContainer);
    }

    // 2. For each .mobile-component-card, find the .component-card inside and move it back
    const mobileCards = document.querySelectorAll('.mobile-component-card');
    mobileCards.forEach((mobileCard) => {
      // Find the original .component-card that we appended for mobile
      const movedCard = mobileCard.querySelector('.component-card');
      if (!movedCard) return; // No .component-card? Skip

      // Determine where to move it (required → #required-components, optional → #optional-components)
      const targetGrid = movedCard.dataset.componentId.includes('-optional')
        ? document.querySelector('#optional-components')
        : document.querySelector('#required-components');

      if (targetGrid) {
        targetGrid.appendChild(movedCard);
      }
    });
  }
 restoreMobileLayout() {
  if (isScrolling) return;

  const previewArea       = document.querySelector('.configurator__preview');
  const mobileBottomBar   = document.querySelector('.mobile-bottom-bar');
  const summaryContainer  = document.querySelector('.configuration-summary');
  const mobileCarousel    = document.querySelector('.mobile-carousel-container');
  const tabsContainer     = document.querySelector('.mobile-carousel-tabs');
  const applyConfigButton = document.getElementById('apply-config-button');

  if (!previewArea || !mobileBottomBar || !summaryContainer || !mobileCarousel || !tabsContainer || !applyConfigButton) {
    return;
  }

  // 1) Move summary into the mobile bottom bar if needed
  if (!mobileBottomBar.contains(summaryContainer)) {
    mobileBottomBar.appendChild(summaryContainer);
  }

  // 2. Re-order Apply button, Tabs, and Carousel immediately after the preview
  //    using insertAdjacentElement to guarantee the right sequence:
  previewArea.insertAdjacentElement('afterend', applyConfigButton);
  applyConfigButton.insertAdjacentElement('afterend', tabsContainer);
   tabsContainer.insertAdjacentElement('afterend', mobileCarousel);
   const infoSection = document.querySelector('.configurator-description');
  
   if (infoSection) {
    // We want it directly after the carousel, but before the PCB-layout block
    // so insert right after carouselContainer
    mobileCarousel.insertAdjacentElement('afterend', infoSection);
  }

  // 3. Collapse the summary accordion if it’s open
  const header  = summaryContainer.querySelector('.summary-header');
  const content = summaryContainer.querySelector('.summary-content');
  if (header && content && header.getAttribute('aria-expanded') === 'true') {
    header.click();
  }
}


  checkIsMobile() {
    // Simple threshold check
    return window.innerWidth <= 768;
  }
setUpMobileLayout() {
  // 1) Ensure the bottom bar exists
  this.createMobileBottomBar();

  // 2) Grab the anchor node
  const preview = document.querySelector('.configurator__preview');
  if (!preview) return;

  // 3) Remove any old tabs (to avoid duplicates)…
  const existingTabs = document.querySelector('.mobile-carousel-tabs');
  if (existingTabs) existingTabs.remove();

  // 4) Grab (or create) the carousel container
  let carouselContainer = document.querySelector('.mobile-carousel-container');
  if (!carouselContainer) {
    carouselContainer = document.createElement('div');
    carouselContainer.classList.add('mobile-carousel-container');
  }

  // 5) Build the tabs container
  const tabsContainer = document.createElement('div');
  tabsContainer.classList.add('mobile-carousel-tabs');
  tabsContainer.style.display = 'none';
  const configuratorTab = document.createElement('button');
  configuratorTab.classList.add('mobile-carousel-tab', 'active');
  configuratorTab.textContent = 'Preview';
  configuratorTab.addEventListener('click', () => this.switchTab('configurator'));
  const partsTab = document.createElement('button');
  partsTab.classList.add('mobile-carousel-tab');
  partsTab.textContent = 'Components';
  partsTab.addEventListener('click', () => this.switchTab('parts'));
  tabsContainer.appendChild(configuratorTab);
  tabsContainer.appendChild(partsTab);

  // 6) Grab the apply-config button
  const applyConfigButton = document.getElementById('apply-config-button');

  // 7) Insert in this exact order *after* the preview:
  //    a) carouselContainer  → moves it if already in DOM
  //    b) tabsContainer      → now sits between preview & carousel
  //    c) applyConfigButton  → now sits between preview & tabs
  preview.insertAdjacentElement('afterend', carouselContainer);
  preview.insertAdjacentElement('afterend', tabsContainer);
  if (applyConfigButton) {
    preview.insertAdjacentElement('afterend', applyConfigButton);
  }

  // 8) Now initialize your carousel logic
  this.setupMobileCarousel(carouselContainer);
  this.switchTab('configurator');

  // 9) (Optional) Move specs & description immediately after the carousel
  const specsAccordion = document.querySelector('.specs-accordion');
  if (specsAccordion) {
    carouselContainer.parentNode.insertBefore(
      specsAccordion,
      carouselContainer.nextSibling
    );
  }
  const configDescription = document.querySelector('.configurator__description');
  if (configDescription) {
    carouselContainer.parentNode.insertBefore(
      configDescription,
      carouselContainer.nextSibling
    );
  }

  // 10) Refresh your summary/conflicts
  this.evaluateConflicts();
  this.updateConfiguratorSummary();
  this.updateTotalPrice();
}



switchTab(tab) {
  // 1. Update tab styling
  const tabs = document.querySelectorAll('.mobile-carousel-tab');
  tabs.forEach(t => t.classList.remove('active'));
  const label = tab === 'configurator' ? 'Configurator' : 'Parts';
  const activeButton = Array.from(tabs).find(t => t.textContent === label);
  if (activeButton) activeButton.classList.add('active');

  // 2. Show/hide each mobile card based on whether its handle includes "-optional"
  this.carouselCards.forEach(card => {
    const isOptional = card.dataset.handle.includes('-optional');
    if (tab === 'configurator') {
      card.style.display = isOptional ? 'none' : 'block';
    } else {
      card.style.display = isOptional ? 'block' : 'none';
    }
  });

  // 3. Jump to the first visible card
  const firstVisible = this.carouselCards.findIndex(card => card.style.display !== 'none');
  if (firstVisible !== -1) {
    this.goToCard(firstVisible);
  }
}



  setupMobileCarousel(carouselContainer) {
    const track = document.createElement('div');
    track.classList.add('mobile-carousel-track');

    carouselContainer.style.perspective = '1000px'; 
    carouselContainer.appendChild(track);

    // Get all component cards and sort them into categories
    const allCards = Array.from(document.querySelectorAll(".component-card"));
    const sortedCards = {
      required: [],
      addons: [],
      extras: []
    };

    // Sort cards into their respective categories
    allCards.forEach((card) => {
      const componentHandle = card.getAttribute("data-component-handle");
      if (!componentHandle) return;

        // Find the corresponding component in `this.components`
      const component = this.components.find(c => c.handle === componentHandle);
      if (!component) return;

      sortedCards.required.push({ card, component });
    });

    // Combine cards in desired order: Required → Add-ons → Extras
    const orderedCards = [
      ...sortedCards.required,
    ];

    const configuratorCards = sortedCards.required;
    const partsCards = sortedCards.addons.concat(sortedCards.extras);

    // Create carousel cards in the new order
    configuratorCards.forEach(({ component, card }) => {
      const carouselCardEl = this.buildMobileCarouselCard(component, card.dataset.componentId);
      this.carouselCards.push(carouselCardEl);
      track.appendChild(carouselCardEl);
    });

    // **Ensure dropdowns have correct options**
    this.updateOptionsGrid("carousel");

    // **Attach gestures**
    this.attachGestureHandlers(carouselContainer);
    
    this.carouselIndex = 0;
    this.renderMobileCarousel();
  }
  buildMobileCarouselCard(component, dataComponentId) {
  const card = document.createElement('div');
  card.classList.add('mobile-component-card');
  card.setAttribute('data-handle', dataComponentId);

  // Insert the existing desktop component-card
  const desktopComponentCard = document.querySelector(`.component-card[data-component-id="${dataComponentId}"]`);
  if (desktopComponentCard) {
    desktopComponentCard.style.display = 'block';
    card.append(desktopComponentCard);
  }

  // Options container (Dropdowns)
  const optionsWrapper = document.createElement('div');
  optionsWrapper.classList.add('mobile-card-options');
  card.appendChild(optionsWrapper);

  // Dropdowns for selecting variants
  component.options.forEach((opt, optIndex) => {
    const optContainer = document.createElement('div');
    optContainer.classList.add('mobile-option-container');

    const label = document.createElement('label');
    label.textContent = opt.name;
    optContainer.appendChild(label);

    const select = document.createElement('select');
    select.classList.add('mobile-option-select');
    select.dataset.componentHandle = component.handle;
    select.dataset.position = optIndex + 1;

    // Default "Select" Option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = `Select ${opt.name}`;
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    // Listen for Changes
    select.addEventListener('change', (e) => {
      this.handleVariantChange(e, "carousel");
    });

    optContainer.appendChild(select);
    optionsWrapper.appendChild(optContainer);
  });

  this.handleDropDownAvailability(optionsWrapper);
  return card;
}

  renderMobileCarousel() {
    // The maximum offset in px or deg from the center
    const cardWidth = 250; // approximate width in px
    const offsetX = 70;    // how far left/right each step goes
    const rotationY = 30;  // how many degrees we rotate
    const scaleFactor = 0.8; // how much each step scales

    // For each card, figure out how far it is from carouselIndex
    this.carouselCards.forEach((cardEl, i) => {
      const diff = i - this.carouselIndex;
      if (diff === 0) {
        cardEl.classList.add('active');
      } else {
        cardEl.classList.remove('active');
      }

      // If diff = 0 => center card
      // If diff = 1 => one step to the right, etc.
      let translateX = diff * offsetX;
      let rotateY = diff * -rotationY;
      // Scale (bigger in center, smaller outwards)
      let scale = 1 - Math.abs(diff) * (1 - scaleFactor);

      // Bring center card forward (z = 100?), push others back
      let translateZ = diff === 0 ? 100 : 0;

      // Apply transform
      cardEl.style.transition = 'transform 0.4s ease';
      cardEl.style.transformStyle = 'preserve-3d';
      cardEl.style.transform = `
        translateX(${translateX}px)
        translateZ(${translateZ}px)
        rotateY(${rotateY}deg)
        scale(${scale})
      `;


      // If you want to fade out the far ones, you can do:
      let opacity = 1 - (Math.abs(diff) * 0.15);
      if (opacity < 0.3) opacity = 0.3;
      cardEl.style.opacity = opacity.toString();

      // Let’s keep the center card on top
      cardEl.style.zIndex = 100 - Math.abs(diff);
    });
    const track = document.querySelector('.mobile-carousel-track');
    if (track) {
      const trackRect = track.getBoundingClientRect();
    }
    const grid = document.querySelector('.configurator__grid');
    if (grid) {
      const rect = grid.getBoundingClientRect();
    }
  }
  attachGestureHandlers(carouselContainer) {
      let isVerticalScroll = false;
      let isHorizontalScroll = false;
      let hasSwiped = false; // Track if a swipe has already occurred for this gesture

      carouselContainer.addEventListener('touchstart', (e) => {
          this.carouselIsDragging = true;
          this.carouselStartX = e.touches[0].clientX;
          this.carouselStartY = e.touches[0].clientY;
          hasSwiped = false; // Reset swipe state
          isVerticalScroll = false;
          isHorizontalScroll = false;
      });

      carouselContainer.addEventListener('touchmove', (e) => {
          if (!this.carouselIsDragging || hasSwiped) return; // Skip if already swiped

          const deltaX = e.touches[0].clientX - this.carouselStartX;
          const deltaY = e.touches[0].clientY - this.carouselStartY;

          // Check if the user is scrolling vertically or horizontally
          if (!isHorizontalScroll && !isVerticalScroll) {
              if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
                  isHorizontalScroll = true;
              } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
                  isVerticalScroll = true;
              }
          }

          if (isHorizontalScroll) {
              e.preventDefault(); // Prevent vertical scrolling

              if (Math.abs(deltaX) > 20) { // Threshold for swipe
                  hasSwiped = true; // Mark that we’ve already swiped for this touch
                  if (deltaX > 0) {
                      this.goToCard(this.carouselIndex - 1); // Swipe right
                  } else {
                      this.goToCard(this.carouselIndex + 1); // Swipe left
                  }

                  // Reset start point for potential next swipe
                  this.carouselStartX = e.touches[0].clientX;
                  this.carouselStartY = e.touches[0].clientY;
              }
          }
      });

      carouselContainer.addEventListener('touchend', () => {
          this.carouselIsDragging = false;
      });
  }
 goToCard(newIndex) {
  const total = this.carouselCards.length;

  // 1. Circular wrap
  if (newIndex < 0)           newIndex = total - 1;
  else if (newIndex >= total) newIndex = 0;

  // 2. If that card is hidden, jump to the first visible one
  if (this.carouselCards[newIndex].style.display === 'none') {
    const firstVisible = this.carouselCards.findIndex(c => c.style.display !== 'none');
    if (firstVisible !== -1) newIndex = firstVisible;
  }

  // 3. Remove 'selected' from any previously selected card
  const prev = document.querySelector('.component-card.selected');
  if (prev) prev.classList.remove('selected');

  // 4. Update index and re-render
  this.carouselIndex = newIndex;
  this.renderMobileCarousel();

  // 5. Sync this.selectedComponent and highlight it
  const activeWrapper = this.carouselCards[this.carouselIndex];
  const handle = activeWrapper.dataset.handle.replace(/-optional$/, '');
  const comp = this.components.find(c => c.handle === handle);
  if (comp) {
    this.selectedComponent = comp;
    comp.isOptionalSelection = activeWrapper.dataset.handle.endsWith('-optional');
  }

  // 6. Mark the inner .component-card as selected
  const newCard = activeWrapper.querySelector('.component-card');
  if (newCard) newCard.classList.add('selected');

  // 7. If this wasn’t already configured, refresh its dropdowns
  const wasConfigured = this.selectedVariants.has(activeWrapper.dataset.handle);
  if (!wasConfigured) {
    this.updateOptionsGrid("carousel");
    this.updateSelectedVariant("carousel");
  }
}

  /**
 * Mobile handler for when a user changes any <select> dropdown in a component card.
 * It reuses your existing logic: find the variant, set `this.selectedVariant`,
 * and call `applySelection()` just like on desktop.
 *
 * @param {Event} e          The change event object (from a <select>)
 * @param {Object} component The "component" object (with .variants, .options, etc.)
 */
  createMobileBottomBar() {
    let bottomBar = document.querySelector('.mobile-bottom-bar');
    if (!bottomBar) {
        bottomBar = document.createElement('div');
        bottomBar.classList.add('mobile-bottom-bar');
        document.body.appendChild(bottomBar);
    }
  }

  //#endregion

  //#region Variant Selection Management
  getSelectedVariants(componentHandle) {
    // Gather the main handle
    const baseSelections = this.selectedVariants.get(componentHandle) || [];
    // Gather the -optional handle
    const optionalSelections = this.selectedVariants.get(`${componentHandle}-optional`) || [];
    
    // Normalize to arrays (in case some are stored as single objects)
    const baseArray = Array.isArray(baseSelections) ? baseSelections : [baseSelections];
    const optArray = Array.isArray(optionalSelections) ? optionalSelections : [optionalSelections];
    
    // Return one combined array
    return [...baseArray, ...optArray];
  }
  getVariantTitle(componentHandle, variantId) {
    // 1) Find the component
    const baseHandle = componentHandle.replace(/-optional$/, '');
    const component = this.components.find(c => c.handle === baseHandle);
    if (!component) return 'Unknown Variant';

    // 2) Find the variant by ID
    const variant = component.variants.find(v => v.id === variantId);
    if (!variant) return 'Unknown Variant';

    // 3) Return its user-facing title
    return variant.title; 
  }
  //#endregion

  //#region Conflict Management
 evaluateConflicts() {
  this.clearAllConflictBadges();
  let hasActiveConflict = false;
  let missingRequiredComponents = false;

  // Check for missing required components
  this.components.forEach(component => {
    if (component.required && !this.selectedVariants.has(component.handle)) {
      missingRequiredComponents = true;
    }
  });

  // Now only flag conflicts if *both* components are actually in the config
  this.conflicts.forEach(conflict => {
    const { component1, component1_variants, component2, component2_variants } = conflict;

    // Gather all selected variants for both sides
    const selected1 = this.getSelectedVariants(component1);
    const selected2 = this.getSelectedVariants(component2);

    // **NEW GUARD**: skip if one side isn’t in the config at all
    if (selected1.length === 0 || selected2.length === 0) {
      console.log(`Skipping conflict check for ${component1} ↔ ${component2} because one side missing.`);
      return;
    }

    // convert IDs to sets for quick lookup
    const conflictIds1 = new Set(component1_variants.map(Number));
    const conflictIds2 = new Set(component2_variants.map(Number));

    let conflictExists = false;

    // check each selected v1
    selected1.forEach(v1 => {
      if (conflictIds1.has(v1.id)) {
        // see if any partner in selected2 is *not* a conflict
        const hasValidPartner = selected2.some(v2 => !conflictIds2.has(v2.id));
        if (!hasValidPartner) {
          conflictExists = true;
          this.displayConflictBadge(
            component1,
            this.buildConflictMessage({
              conflictVariantName: this.getVariantTitle(component1, v1.id),
              conflictSide: component1,
              otherSide: component2,
              fallbackDisclaimer: conflict.disclaimer
            }),
            v1.id
          );
        }
      }
    });

    // and vice-versa
    selected2.forEach(v2 => {
      if (conflictIds2.has(v2.id)) {
        const hasValidPartner = selected1.some(v1 => !conflictIds1.has(v1.id));
        if (!hasValidPartner) {
          conflictExists = true;
          this.displayConflictBadge(
            component2,
            this.buildConflictMessage({
              conflictVariantName: this.getVariantTitle(component2, v2.id),
              conflictSide: component2,
              otherSide: component1,
              fallbackDisclaimer: conflict.disclaimer
            }),
            v2.id
          );
        }
      }
    });

    if (conflictExists) {
      hasActiveConflict = true;
    }
  });

  this.updateAddToCartButton(hasActiveConflict, missingRequiredComponents);
}

    /**
   * Build a dynamic conflict message, including buttons for non-conflict partner variants.
   * 
   * @param {Object} opts
   * @param {String} opts.conflictVariantName   - The name/title of the conflicting variant (e.g. "Hotswap PCB")
   * @param {String} opts.conflictSide         - The handle of the side with the conflict (e.g. "pcb")
   * @param {String} opts.otherSide            - The handle of the other side (e.g. "plate")
   * @param {Object[]} opts.otherSideNon       - The user’s currently selected "non-conflicting" variants from other side
   *                                             if you want to list them. But typically you want to show *all possible*
   *                                             partner variants that are safe. So you might pass an array of variant objects.
   * @param {String} opts.fallbackDisclaimer   - A short disclaimer like "ISO plates do not support hotswap PCBs"
   * 
   * @returns {String} - HTML snippet for the conflict tooltip
   */
  buildConflictMessage({
    conflictVariantName,
    conflictSide,
    otherSide,
    fallbackDisclaimer = ''
  }) {
    // Find the partner component (force optional if conflict is optional)
    const partnerComponent = otherSide;

    // Get component data
    const comp = this.components.find(
      (c) => c.handle === partnerComponent.replace(/-optional$/, '')
    );

    const safeVariants = comp.variants.filter(
      (v) => !this.getConflictVariantIdsForComponent(comp.handle).includes(v.id)
    );

    const suggestionButtons = safeVariants
      .map(
        (v) => `
          <button 
            class="conflict-suggestion-button" 
            data-component="${partnerComponent}" 
            data-variant-id="${v.id}"
          >
            ${v.title}
          </button>`
      )
      .join(' ');

    return `
      <div class="conflict-message">
        <div class="tooltip-content">
          <p>
            The <span class="tooltip-badge">${conflictVariantName} ${this.formatComponentTitle(conflictSide)}</span> 
            is incompatible with the <span class="tooltip-badge">${this.getVariantTitle(otherSide, this.getConflictVariantIdsForComponent(otherSide)[0])} ${this.formatComponentTitle(otherSide)}</span>.
          </p>
          <p>Compatible variants:</p>
          <div class="conflict-suggestion-buttons">
            ${suggestionButtons}
          </div>
        </div>
      </div>`;
  }
    /**
   * Returns a unique set of all "conflict" variant IDs for the specified component.
   * 
   * E.g., if multiple conflict definitions mention that "plate" has conflict IDs [ ISO1, ISO2 ],
   * we combine them all. 
   * 
   * @param {String} componentHandle
   * @returns {Number[]} array of variant IDs that are in conflict for this component
   */
  getConflictVariantIdsForComponent(componentHandle) {
    const conflictIds = new Set();
    
    this.conflicts.forEach(conf => {
      if (conf.component1 === componentHandle) {
        conf.component1_variants.map(id => parseInt(id, 10)).forEach(id => conflictIds.add(id));
      }
      if (conf.component2 === componentHandle) {
        conf.component2_variants.map(id => parseInt(id, 10)).forEach(id => conflictIds.add(id));
      }
    });
    
    return Array.from(conflictIds);
  }
  /**
 * Enhanced displayConflictBadge that accepts an HTML string. 
 */
  displayConflictBadge(component, disclaimerHtml, variantId) {
  // 1) figure out which handle to use
  const optionalHandle = `${component}-optional`;
  const hasOptional = this.selectedVariants.has(optionalHandle)
    && this.selectedVariants.get(optionalHandle).some(v => v.id === variantId);
  const target = hasOptional ? optionalHandle : component;

  // 2) find the row, bail if missing or already has an icon
  const compEl = document.querySelector(`[data-component="${target}"]`);
  if (!compEl) return;
  const row = compEl.querySelector(`.summary-item__variant-row[data-variant-id="${variantId}"]`);
  if (!row || row.querySelector('.conflict-icon')) return;

  // 3) make sure row is positioned so we can absolutely position inside it
  if (getComputedStyle(row).position === 'static') {
    row.style.position = 'relative';
  }

  // 4) build icon + tooltip
  const icon = document.createElement('span');
  icon.classList.add('conflict-icon', 'material-symbols-outlined');
  icon.textContent = 'warning';
  icon.style.position = 'relative';  // <-- tooltip will position relative to this
  icon.style.color = '#FFC107';

  const tooltip = document.createElement('div');
  tooltip.classList.add('variant-tooltip');
  tooltip.innerHTML = disclaimerHtml;
  // hide until we measure+reposition
  tooltip.style.visibility = 'hidden';
  tooltip.style.opacity    = '0';
  // placeholder; we’ll overwrite this with an exact px value
  tooltip.style.setProperty('--arrow-left', '50%');

  icon.appendChild(tooltip);
  row.appendChild(icon);

  // 5) on next paint: measure & shift both the box and the arrow
  requestAnimationFrame(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) {
    const summary = document.querySelector('.configuration-summary').getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const pad = 8;
      let shiftX = 0;

    // keep tooltip from spilling out of the summary container
    if (tipRect.right + pad > summary.right) {
      shiftX = (summary.right - pad) - tipRect.right;
    } else if (tipRect.left - pad < summary.left) {
      shiftX = (summary.left + pad) - tipRect.left;
    }

    // nudge the whole tooltip
    tooltip.style.transform = `translateX(-50%) translateX(${shiftX}px)`;

      // now compute exactly where the arrow's tip should sit
      // icon center relative to the tooltip's left edge, then compensate for shiftX
    const arrowLeft = (iconRect.left + iconRect.width/2)
                    - tipRect.left
                    - shiftX;
    tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
    }
    // reveal
    tooltip.style.visibility = '';
    tooltip.style.opacity    = '';
  });
}


  clearAllConflictBadges() {
    // Remove conflict styling/tooltip/icon from every variant row in the summary
    const allVariantRows = document.querySelectorAll('.summary-item__variant');
    allVariantRows.forEach((row) => {
      row.classList.remove('conflict');
      row.removeAttribute('data-tooltip');
      const tooltip = row.querySelector('.variant-tooltip');
      if (tooltip) tooltip.remove();
      const icon = row.querySelector('.conflict-icon');
      if (icon) icon.remove();
    });
  }  
  updateAddToCartButton(hasConflict, missingRequiredComponents) {
  const addToCartButton = document.querySelector('.add-to-cart-button');
  const warningIconContainer = document.querySelector('.add-to-cart-warning');
  const preorderEnabled = document.querySelector('#cb') !== null;
  if (!addToCartButton) return;

  if (this.preorderStatus && this.preorderStatus !== 'live') {
    addToCartButton.disabled = true;
    addToCartButton.classList.add('disabled');
    addToCartButton.innerHTML = `Preorder Ended <br> Status: ${this.preorderStatus.toUpperCase()}`;
    return;
  }

  // Check for sold out components
  let hasSoldOutComponents = false;
  this.selectedVariants.forEach((variants, handle) => {
    const variantsArray = Array.isArray(variants) ? variants : [variants];
    variantsArray.forEach(variant => {
      if (!variant.available) {
        hasSoldOutComponents = true;
      }
    });
  });

  // Check preorder agreement if enabled
  const preorderAgreed = preorderEnabled ? document.querySelector('#cb').checked : true;

  if (hasSoldOutComponents) {
    addToCartButton.disabled = true;
    addToCartButton.classList.add('disabled');
    addToCartButton.textContent = 'Contains Sold Out Components';
  } else if (preorderEnabled && !preorderAgreed) {
    addToCartButton.disabled = true;
    addToCartButton.classList.add('disabled');
    addToCartButton.textContent = 'Please Accept Preorder Agreement';
  } else {
    addToCartButton.disabled = false;
    addToCartButton.classList.remove('disabled');
    
    // Show appropriate warning icons based on state
    addToCartButton.innerHTML = 'Add to Cart';
    
    if (hasConflict) {
      addToCartButton.innerHTML += `
        <span class="material-symbols-outlined conflict-warning">
          warning
        </span>
      `;
    }
    
    // if (missingRequiredComponents) {
    //   addToCartButton.innerHTML += `
    //     <span class="material-symbols-outlined incomplete-build-warning">
    //       warning
    //     </span>
    //   `;
    // }
  }
}
  //#endregion

  //#region Utility Methods
  formatComponentTitle(title, isOptionalSelection = false, isRequired = false) {
    // Remove the parent product name and properly format spaces
    const normalizedParentTitle = this.parentProductTitle.toLowerCase();
    const normalizedTitle = title.toLowerCase();

    // Normalize only for comparison to remove the parent product title
    const baseTitle = title
        .replace(new RegExp(normalizedParentTitle, 'i'), '') // Remove parent product name (case-insensitive)
        .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
        .trim(); // Trim extra whitespace
    // Only show "Extra" if it's a required component in the optional tab
    return (isOptionalSelection && isRequired) ? `Extra ${baseTitle}` : baseTitle;
  }
  handleize(str) {
    return str.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-$/, '')
      .replace(/^-/, '');
  }
  parseVariantTitle(title) {
    if (!title) return [];
    return title.split(' / ').map(option => option.trim());
  }
  areAllDropdownsFilled() {
    const dropdowns = document.querySelectorAll('.option-select');
    return Array.from(dropdowns).every(select => select.value !== '');
  }
  showToast(message, type = 'success') {
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Add a unique identifier to help track this specific toast
    const toastId = Date.now().toString();
    toast.dataset.toastId = toastId;
    
    const title = document.createElement('div');
    title.className = 'toast-title';
    title.textContent = this.formatComponentTitle(message);
    toast.appendChild(title);

    // Get variant info from selectedVariants or a passed in variant
    let variant;
    if (this.selectedComponent) {
      const variantHandle = this.selectedComponent.isOptionalSelection ? 
        `${this.selectedComponent.handle}-optional` : 
        this.selectedComponent.handle;
      variant = this.selectedVariants.get(variantHandle);
      
      // If it's an optional component, get the last added variant from the array
      if (this.selectedComponent.isOptionalSelection && Array.isArray(variant)) {
        variant = variant[variant.length - 1];
      }
    }

    if (variant) {
      const variantText = document.createElement('div');
      variantText.className = 'toast-variant';
      variantText.textContent = variant.title;
      toast.appendChild(variantText);
    }

    const toastContainer = document.querySelector('.toast-container');
    if (toastContainer) {
      
      // Insert at the beginning to show newest on top
      toastContainer.insertBefore(toast, toastContainer.firstChild);
      
      // Clear any existing timeout for this toast
      if (this.toastTimeouts.has(toastId)) {
        clearTimeout(this.toastTimeouts.get(toastId));
      }
      
      // Set up removal after delay
      const fadeOutTimeout = setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        
        const removeTimeout = setTimeout(() => {
          if (toastContainer.contains(toast)) {
            toastContainer.removeChild(toast);
            this.toastTimeouts.delete(toastId);
          }
        }, 300);
        
        this.toastTimeouts.set(toastId + '_remove', removeTimeout);
      }, 3000);
      
      this.toastTimeouts.set(toastId, fadeOutTimeout);
    } else {
      console.error('[Toast Debug] Toast container not found!');
    }
  }
  
  /**
 * Resets a component card to its default state after removing it from the configuration
 * @param {Object} component - The component to reset
 */
  resetComponentCard(component) {
    if (!component) return;
    
    // Reset the component card UI
    const card = document.querySelector(`.component-card[data-component-id="${component.handle}"]`);
    if (card) {
      // Reset desktop view image to blueprint if available
      const desktopImage = card.querySelector('.component-card__desktop .component-card__image');
      if (desktopImage && component.blueprint) {
        desktopImage.src = component.blueprint;
      }
      
      // Reset option flags to their original option names
      const optionFlags = card.querySelectorAll('.option-flag');
      optionFlags.forEach(flag => {
        const optionName = flag.dataset.option;
        if (!optionName) return;

        // Convert from handleized format (e.g., "case-color" to "Case Color")
        if (optionName) {
          const formattedName = optionName.split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          flag.textContent = formattedName;
        }
        flag.classList.remove('selected');
      });
    }
    
    // Reset the navigation image
    const navigationImage = document.querySelector('.component-navigation__image');
    if (navigationImage && component.blueprint) {
      navigationImage.src = component.blueprint;
      navigationImage.classList.remove('loading');
    }
    
    // Reset the layered preview image
    const layerId = `layer-${component.handle}`;
    const layerImage = document.getElementById(layerId);
    if (layerImage) {
      layerImage.classList.remove('visible');
      if (this.showPlaceholders && component.blueprint) {
        layerImage.src = component.blueprint;
      } else {
        layerImage.src = '';
      }
    }
    
    // Reset the options in the options grid
    if (this.selectedComponent && this.selectedComponent.handle === component.handle) {
      const optionsGrid = document.querySelector('.options-grid');
      if (optionsGrid) {
        this.resetOptionsContent(optionsGrid);
      }
    }
  }
  //#endregion

  //#region Navigation Methods
  navigateComponents(direction) {
    const currentTab = document.querySelector('.tab-button.active');
    const tabType = currentTab.dataset.tab;
    const componentCards = Array.from(document.querySelector(`#${tabType}-components`).querySelectorAll('.component-card:not(.locked)'));
    const currentIndex = componentCards.findIndex(card => card.classList.contains('selected'));
    let nextIndex;

    if (direction === 'next') {
      nextIndex = currentIndex + 1 >= componentCards.length ? 0 : currentIndex + 1;
    } else {
      nextIndex = currentIndex - 1 < 0 ? componentCards.length - 1 : currentIndex - 1;
    }

    const nextCard = componentCards[nextIndex];
    if (nextCard) {
      this.selectComponent(nextCard.dataset.componentId, true);
      
      const container = document.querySelector('.components-grid');
      const cardRect = nextCard.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      if (cardRect.right > containerRect.right) {
        container.scrollBy({ left: cardRect.width, behavior: 'smooth' });
      } else if (cardRect.left < containerRect.left) {
        container.scrollBy({ left: -cardRect.width, behavior: 'smooth' });
      }
    }
  }
  setupKeyboardNavigation() {
    document.addEventListener('keydown', (event) => {
      // Check if modal is open
      const modal = document.querySelector('.image-modal');
      if (modal && modal.classList.contains('active')) {
        return; // Exit early if modal is open, letting modal handle its own navigation
      }

      // Handle dropdown-specific tab navigation
      if (event.target.tagName === 'SELECT' && event.key === 'Tab' && !event.shiftKey) {
        const currentSelect = event.target;
        const allSelects = Array.from(document.querySelectorAll('.option-select'));
        const currentIndex = allSelects.indexOf(currentSelect);
        
        // If this is the last dropdown and all are filled
        if (currentIndex === allSelects.length - 1 && this.areAllDropdownsFilled()) {
          event.preventDefault();
          // Focus the apply button if it exists and is visible
          const applyButton = document.querySelector('.apply-selection-button:not(.hidden)');
          if (applyButton) {
            applyButton.focus();
          } else {
            // Move to next component if no apply button
            this.navigateComponents('next');
          }
        }
        return;
      }

      // Global left/right navigation
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.navigateComponents(event.key === 'ArrowLeft' ? 'prev' : 'next');
      }
    });
  }
  updateNavigationButtons() {
    // Remove disabled states since we now have circular navigation
    const prevButton = document.querySelector('.prev-component');
    const nextButton = document.querySelector('.next-component');
    const forwardButton = document.querySelector('.forward-component');

    if (prevButton) prevButton.disabled = false;
    if (nextButton) nextButton.disabled = false;
    if (forwardButton) forwardButton.disabled = false;
  }
  //#endregion

  //#region Cart Management
  async addConfigurationToCart() {
    if (this.preorderStatus && this.preorderStatus !== 'live') {
      return;
    }
    const bundleId = Date.now().toString();
    const items = [];

    // Get all visible layer images in correct order
    const layerImages = this.components
      .filter(component => component.required)
      .sort((a, b) => a.layer_index - b.layer_index)
      .map(component => {
        const layerId = `layer-${component.handle}`;
        const layerImage = document.getElementById(layerId);
        return layerImage?.classList.contains('visible') ? layerImage.src : null;
      })
      .filter(Boolean);

    // Create a Map to store combined quantities by variant ID
    const combinedVariants = new Map();

    // Process all variants and combine quantities
    this.selectedVariants.forEach((variant, handle) => {
      // Strip -optional from handle when looking up component
      const baseHandle = handle.replace(/-optional$/, '');
      const component = this.components.find(c => c.handle === baseHandle);
      
      if (!variant || !component) {
        console.log('No variant or component for handle:', handle);
        return;
      }

      // Convert to array if not already (handles both single variants and arrays)
      const variants = Array.isArray(variant) ? variant : [variant];
      
      variants.forEach(v => {
        if (!v || !v.id || !v.available) {
          console.error('Invalid or unavailable variant:', v);
          alert(`${component.title} is not available`);
          return;
        }

        // Get this component's layer image
        const layerId = `layer-${component.handle}`;
        const layerImage = document.getElementById(layerId);
        const componentImage = layerImage?.classList.contains('visible') ? layerImage.src : null;

        // Strip parent product title from component title
        const componentTitle = component.title
          .replace(`${this.parentProductTitle} - `, '')
          .replace(`${this.parentProductTitle} `, '')
          .replace(this.parentProductTitle, '')
          .trim();

        // Get existing entry or create new one
        const existingEntry = combinedVariants.get(v.id) || {
          id: v.id,
          quantity: 0
        };

        // Only add properties if the setting is enabled
        if (this.data.add_line_item_properties) {
          existingEntry.properties = {
            '_Bundle Type': 'keyboard_config',
            '_Bundle ID': bundleId,
            '_Parent Product': this.parentProductTitle,
            '_Component Type': componentTitle,
            '_Layer Image': componentImage || '',
            '_Layer Index': component.layer_index || 0,
            '_Layer Images': layerImages.join('|') || ''
          };

          // Add variant options as properties
          if (v.options) {
            v.options.forEach((value, index) => {
              const optionName = component.options[index]?.name;
              if (optionName) {
                existingEntry.properties[`_option_${optionName.toLowerCase()}`] = value;
              }
            });
          }
        }

        // Add quantity (default to 1 for required components)
        existingEntry.quantity += v.quantity || 1;
        combinedVariants.set(v.id, existingEntry);
      });
    });

    // Convert combined variants to array for cart addition
    items.push(...combinedVariants.values());

    if (items.length === 0) {
      alert('No items to add to cart');
      return;
    }

    console.log('Sending cart request with items:', items);

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ items })
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        console.error('Cart API error:', responseData);
        throw new Error(responseData.description || 'Failed to add items to cart');
      }
      
      // Refresh cart drawer or redirect to cart page
      if (typeof refreshCart === 'function') {
        refreshCart();
      } else {
        window.location.href = '/cart';
      }
    } catch (error) {
      console.error('Error adding configuration to cart:', error);
      alert('Error adding configuration to cart: ' + error.message);
    }
  }
  //#endregion
}

//#region OnLoad
document.addEventListener('DOMContentLoaded', function () {
  //#region modal
    const modal = document.querySelector('.image-modal');
    const modalImage = modal.querySelector('.modal-image');
    const loadingOverlay = modal.querySelector('.modal-loading-overlay');
    const closeButton = modal.querySelector('.modal-close');
    const prevButton = modal.querySelector('.modal-prev');
    const nextButton = modal.querySelector('.modal-next');
    const thumbnails = document.querySelectorAll('.product-thumbnail');
    let currentImageIndex = 0;
    const images = Array.from(thumbnails).map(thumb => ({
      fullRes: thumb.dataset.fullRes,
      thumbnail: thumb.dataset.thumbnail,
      alt: thumb.querySelector('img').alt
    }));
  
    function setLoading(loading) {
    loadingOverlay.classList.toggle('loading', loading);
    modalImage.classList.toggle('loading', loading);
    }
  
  const infoTooltips = document.querySelectorAll('.info-tooltip');

infoTooltips.forEach(tooltip => {
  tooltip.addEventListener('mouseenter', function() {
    const tooltipContent = this.querySelector('.tooltip-content');
    if (!tooltipContent) return;
    
    // Reset positioning to default
    tooltipContent.style.bottom = '100%';
    tooltipContent.style.top = 'auto';
    tooltipContent.style.left = '50%';
    tooltipContent.style.right = 'auto';
    tooltipContent.style.transform = 'translate(-50%, -12px)';
    
    // Force a reflow to ensure the tooltip is rendered with the default position
    tooltipContent.offsetHeight;
    
    // Now check if it's overflowing the viewport
    const tooltipRect = tooltipContent.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Check right edge overflow - more aggressive detection
    if (tooltipRect.right + 20 > viewportWidth) {
      tooltipContent.style.left = 'auto';
      tooltipContent.style.right = '0';
      tooltipContent.style.transform = 'translateY(-12px)';
    }
    
    // Check left edge overflow
    if (tooltipRect.left < 20) {
      tooltipContent.style.left = '0';
      tooltipContent.style.right = 'auto';
      tooltipContent.style.transform = 'translateY(-12px)';
    }
    
    // Check top edge overflow
    if (tooltipRect.top < 20) {
      tooltipContent.style.bottom = 'auto';
      tooltipContent.style.top = '100%';
      tooltipContent.style.transform = 'translate(-50%, 12px)';
      
      // Recheck horizontal overflow with new position
      setTimeout(() => {
        const newRect = tooltipContent.getBoundingClientRect();
        if (newRect.right + 20 > viewportWidth) {
          tooltipContent.style.left = 'auto';
          tooltipContent.style.right = '0';
          tooltipContent.style.transform = 'translateY(12px)';
        }
        if (newRect.left < 20) {
          tooltipContent.style.left = '0';
          tooltipContent.style.right = 'auto';
          tooltipContent.style.transform = 'translateY(12px)';
        }
      }, 0);
    }
  });
});
  

  function openModal(index) {
    currentImageIndex = index;
    updateModalImage();
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    // Reset the image src to thumbnail when closing to save memory
    setTimeout(() => {
      modalImage.src = images[currentImageIndex].thumbnail;
      setLoading(false);
    }, 300); // Wait for fade out animation
  }

  function updateModalImage() {
    setLoading(true);
    
    // Show thumbnail first for quick loading
    modalImage.src = images[currentImageIndex].thumbnail;
    
    // Update image type indicator
    const imageTypeIndicator = modal.querySelector('.image-type-indicator');
    const altText = images[currentImageIndex].alt.toLowerCase();
    
    if (altText.includes('none')) {
      imageTypeIndicator.textContent = '';
    } else if (altText.includes('render')) {
      imageTypeIndicator.textContent = 'RENDER';
    } else {
      imageTypeIndicator.textContent = 'REAL PHOTO';
    }
    
    // Then load the high-res version
    const highResImage = new Image();
    highResImage.onload = function() {
      const imageContainer = modal.querySelector('.modal-image-container');
      const modalContent = modal.querySelector('.modal-content');
      
      // Calculate dimensions maintaining aspect ratio
      const viewportHeight = window.innerHeight * 0.85; // 85vh
      const viewportWidth = window.innerWidth * 0.75;  // 75vw
      const imageRatio = highResImage.naturalHeight / highResImage.naturalWidth;
      
      let targetWidth, targetHeight;
      
      if (imageRatio * viewportWidth <= viewportHeight) {
        // Image fits by width
        targetWidth = viewportWidth;
        targetHeight = viewportWidth * imageRatio;
      } else {
        // Image fits by height
        targetHeight = viewportHeight;
        targetWidth = viewportHeight / imageRatio;
      }
      
      // Set container dimensions
      imageContainer.style.width = `${targetWidth}px`;
      imageContainer.style.height = `${targetHeight}px`;
      
      // Update image source
      modalImage.src = images[currentImageIndex].fullRes;
      
      // Short delay to ensure the new image starts loading
      setLoading(false);
    };
    highResImage.src = images[currentImageIndex].fullRes;
    
    modalImage.alt = images[currentImageIndex].alt;
  }

   function nextImage() {
    currentImageIndex = (currentImageIndex + 1) % images.length;
    updateModalImage();
  }

  function prevImage() {
    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    updateModalImage();
  }

    // Event Listeners
    thumbnails.forEach((thumbnail, index) => {
      thumbnail.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(index);
      });
    });

    closeButton.addEventListener('click', closeModal);
    nextButton.addEventListener('click', nextImage);
    prevButton.addEventListener('click', prevImage);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Keyboard navigation for modal
    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('active')) return;
    
      e.preventDefault(); // Prevent any other keyboard handlers
    
      switch (e.key) {
        case 'Escape':
          closeModal();
          break;
        case 'ArrowLeft':
          prevImage();
          break;
        case 'ArrowRight':
          nextImage();
          break;
      }
    });

    // Setup horizontal scrolling for component grids
    function setupHorizontalScrolling() {
      // Get all components grids
      const componentsGrids = document.querySelectorAll('.components-grid');
      
      // Add wheel event listener to each grid for trackpad scrolling
      componentsGrids.forEach(grid => {
        // Variables for click and drag
        let isMouseDown = false;
        let startX;
        let scrollLeft;
    
        // Handle wheel/trackpad scrolling
        grid.addEventListener('wheel', (event) => {
          // If shift key is pressed or this is a horizontal scroll event (e.g., trackpad)
          if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            // This is already a horizontal scroll, let the browser handle it naturally
            return;
          }
          
          // For vertical scrolling, convert to horizontal
          event.preventDefault();
          const scrollMultiplier = 20; // Increase this value to make scrolling faster
          grid.scrollLeft += event.deltaY * scrollMultiplier;
        });
    
        // Handle click and drag scrolling
        grid.addEventListener('mousedown', (event) => {
          isMouseDown = true;
          grid.classList.add('grabbing');
          startX = event.pageX - grid.offsetLeft;
          scrollLeft = grid.scrollLeft;
        });
    
        grid.addEventListener('mouseleave', () => {
          isMouseDown = false;
          grid.classList.remove('grabbing');
        });
    
        grid.addEventListener('mouseup', () => {
          isMouseDown = false;
          grid.classList.remove('grabbing');
        });
    
        grid.addEventListener('mousemove', (event) => {
          if (!isMouseDown) return;
          event.preventDefault();
          const x = event.pageX - grid.offsetLeft;
          const walk = (x - startX) * 3; // Scroll speed multiplier
          grid.scrollLeft = scrollLeft - walk;
        });
      });
    }

    setupHorizontalScrolling();
    document.addEventListener('wheel', (event) => {
      if (event.target.closest('.tooltip-content')) {
        event.stopPropagation();
        return;
      }
    }, true);
    //#endregion
  });
//#endregion

window.toggleEnabledCart = function(checkbox) {
    if (window.ProductConfigurator) {
        window.ProductConfigurator.updateAddToCartButton(false, false);
    }
};

ProductConfigurator.prototype.hasComponentConflicts = function() {
  return false; // Since we don't need to check for conflicts, always return false
};

// Clarifying text modal
const clarifyModal = document.createElement('div');
clarifyModal.id = 'clarify-modal';
clarifyModal.classList.add('clarify-modal');
clarifyModal.innerHTML = `
  <div class="clarify-modal-content">
    <button class="clarify-modal-close">
      <span class="material-symbols-outlined">cancel</span>
    </button>
    <h3></h3>
    <hr />
    <div class="clarify-modal-text"></div>
  </div>
`;
document.body.appendChild(clarifyModal);

const dialogTitle = clarifyModal.querySelector('h3');
const dialogText = clarifyModal.querySelector('.clarify-modal-text');
const closeBtn = clarifyModal.querySelector('.clarify-modal-close');

document.querySelectorAll('.clarify-info-icon').forEach(icon => {
  icon.addEventListener('click', e => {
    e.stopPropagation();
    dialogTitle.textContent = icon.getAttribute('data-clarify-title');
    dialogText.textContent = icon.getAttribute('data-clarify-text');
    clarifyModal.style.display = 'flex';
  });
});

closeBtn.addEventListener('click', () => clarifyModal.style.display = 'none');
clarifyModal.addEventListener('click', e => {
  if (e.target === clarifyModal) clarifyModal.style.display = 'none';
}); 
