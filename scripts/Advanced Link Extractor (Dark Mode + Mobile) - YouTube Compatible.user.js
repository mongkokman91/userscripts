// ==UserScript==
// @name         Advanced Link Extractor (Dark Mode + Mobile) - YouTube Compatible
// @namespace    advanced-link-extractor
// @version      14.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Advanced%20Link%20Extractor%20%28Dark%20Mode%20%2B%20Mobile%29%20-%20YouTube%20Compatible.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Advanced%20Link%20Extractor%20%28Dark%20Mode%20%2B%20Mobile%29%20-%20YouTube%20Compatible.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Advanced%20Link%20Extractor%20%28Dark%20Mode%20%2B%20Mobile%29%20-%20YouTube%20Compatible.user.js
// @description  Extract links with dark mode, mobile-friendly, and YouTube Trusted Types compatible
// @author       AI
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
'use strict';

function notify(msg, color = '#10b981', duration = 3000) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    background: ${color}; color: white; padding: 12px 20px;
    border-radius: 8px; font-family: system-ui; font-size: 14px;
    font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function getRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

function groupLinks(links, groupBy, segmentPosition = 1, pathDepth = 1) {
  const groups = {};

  links.forEach(url => {
    let groupKey;

    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      switch(groupBy) {
        case 'domain':
          groupKey = getRootDomain(urlObj.hostname);
          break;
        case 'subdomain':
          groupKey = urlObj.hostname;
          break;
        case 'pattern-segment':
          if (pathParts.length >= segmentPosition) {
            groupKey = `/${pathParts[segmentPosition - 1]}/`;
          } else {
            groupKey = '(no segment at position ' + segmentPosition + ')';
          }
          break;
        case 'pattern-depth':
          const depthParts = pathParts.slice(0, pathDepth);
          groupKey = depthParts.length > 0 ? `/${depthParts.join('/')}/` : '/';
          break;
        case 'pattern-full':
          groupKey = urlObj.pathname || '/';
          if (!groupKey.endsWith('/')) groupKey += '/';
          break;
        default:
          groupKey = 'all';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(url);

    } catch (e) {
      if (!groups['invalid']) {
        groups['invalid'] = [];
      }
      groups['invalid'].push(url);
    }
  });

  return groups;
}

function createElement(tag, styles = {}, attributes = {}) {
  const el = document.createElement(tag);
  Object.entries(styles).forEach(([key, value]) => {
    el.style[key] = value;
  });
  Object.entries(attributes).forEach(([key, value]) => {
    el[key] = value;
  });
  return el;
}

function showGroupingDialog(allLinks) {
  return new Promise((resolve) => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

    const overlay = createElement('div', {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0,0,0,0.9)',
      zIndex: '999998',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? '0' : '20px'
    });

    const dialog = createElement('div', {
      background: '#1a1a1a',
      borderRadius: isMobile ? '0' : '12px',
      width: isMobile ? '100%' : '95%',
      maxWidth: '800px',
      height: isMobile ? '100%' : 'auto',
      maxHeight: isMobile ? '100%' : '85vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
    });

    // Header
    const header = createElement('div', {
      padding: isMobile ? '20px' : '24px',
      borderBottom: '1px solid #333'
    });

    const title = createElement('h2', {
      margin: '0 0 8px 0',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '18px' : '20px',
      color: '#fff'
    });
    title.textContent = 'Link Extractor';

    const subtitle = createElement('p', {
      margin: '0',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '13px' : '14px',
      color: '#999'
    });
    subtitle.textContent = `Found ${allLinks.length} links. Group and filter them below.`;

    header.appendChild(title);
    header.appendChild(subtitle);

    // Controls section
    const controlsSection = createElement('div', {
      padding: isMobile ? '16px' : '20px',
      borderBottom: '1px solid #333',
      overflowX: 'auto'
    });

    const controlsContainer = createElement('div', {
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? '12px' : '16px'
    });

    // Group by row
    const groupByRow = createElement('div', {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: '12px',
      alignItems: isMobile ? 'stretch' : 'center'
    });

    const groupByLabel = createElement('label', {
      fontFamily: 'system-ui',
      fontSize: isMobile ? '13px' : '14px',
      fontWeight: '600',
      color: '#fff'
    });
    groupByLabel.textContent = 'Group by:';

    const groupBySelect = createElement('select', {
      padding: isMobile ? '12px' : '8px 12px',
      border: '1px solid #444',
      borderRadius: '6px',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '15px' : '14px',
      cursor: 'pointer',
      background: '#2a2a2a',
      color: '#fff',
      minHeight: isMobile ? '48px' : 'auto'
    }, { id: 'group-by' });

    ['Domain', 'Full Hostname', 'Pattern - By Segment', 'Pattern - By Depth', 'Pattern - Full Path'].forEach((text, idx) => {
      const option = document.createElement('option');
      option.value = ['domain', 'subdomain', 'pattern-segment', 'pattern-depth', 'pattern-full'][idx];
      option.textContent = text;
      groupBySelect.appendChild(option);
    });

    groupByRow.appendChild(groupByLabel);
    groupByRow.appendChild(groupBySelect);

    // Segment controls
    const segmentControls = createElement('div', {
      display: 'none',
      flexDirection: isMobile ? 'column' : 'row',
      gap: '12px',
      alignItems: isMobile ? 'stretch' : 'center'
    }, { id: 'segment-controls' });

    const segmentLabel = createElement('label', {
      fontFamily: 'system-ui',
      fontSize: '13px',
      color: '#999'
    });
    segmentLabel.textContent = 'Position:';

    const segmentPosition = createElement('select', {
      padding: isMobile ? '12px' : '6px 10px',
      border: '1px solid #444',
      borderRadius: '4px',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '15px' : '13px',
      cursor: 'pointer',
      background: '#2a2a2a',
      color: '#fff',
      minHeight: isMobile ? '48px' : 'auto'
    }, { id: 'segment-position' });

    segmentControls.appendChild(segmentLabel);
    segmentControls.appendChild(segmentPosition);

    // Depth controls
    const depthControls = createElement('div', {
      display: 'none',
      flexDirection: isMobile ? 'column' : 'row',
      gap: '12px',
      alignItems: isMobile ? 'stretch' : 'center'
    }, { id: 'depth-controls' });

    const depthLabel = createElement('label', {
      fontFamily: 'system-ui',
      fontSize: '13px',
      color: '#999'
    });
    depthLabel.textContent = 'Depth:';

    const depthLevel = createElement('select', {
      padding: isMobile ? '12px' : '6px 10px',
      border: '1px solid #444',
      borderRadius: '4px',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '15px' : '13px',
      cursor: 'pointer',
      background: '#2a2a2a',
      color: '#fff',
      minHeight: isMobile ? '48px' : 'auto'
    }, { id: 'depth-level' });

    depthControls.appendChild(depthLabel);
    depthControls.appendChild(depthLevel);

    // Buttons row
    const buttonsRow = createElement('div', {
      display: 'flex',
      gap: '8px'
    });

    const selectAllBtn = createElement('button', {
      padding: isMobile ? '12px 16px' : '8px 16px',
      border: '1px solid #444',
      borderRadius: '6px',
      background: '#2a2a2a',
      color: '#fff',
      cursor: 'pointer',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '14px' : '13px',
      flex: '1',
      minHeight: isMobile ? '48px' : 'auto'
    }, { id: 'select-all-groups' });
    selectAllBtn.textContent = 'Select All';

    const deselectAllBtn = createElement('button', {
      padding: isMobile ? '12px 16px' : '8px 16px',
      border: '1px solid #444',
      borderRadius: '6px',
      background: '#2a2a2a',
      color: '#fff',
      cursor: 'pointer',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '14px' : '13px',
      flex: '1',
      minHeight: isMobile ? '48px' : 'auto'
    }, { id: 'deselect-all-groups' });
    deselectAllBtn.textContent = 'Deselect All';

    buttonsRow.appendChild(selectAllBtn);
    buttonsRow.appendChild(deselectAllBtn);

    controlsContainer.appendChild(groupByRow);
    controlsContainer.appendChild(segmentControls);
    controlsContainer.appendChild(depthControls);
    controlsContainer.appendChild(buttonsRow);
    controlsSection.appendChild(controlsContainer);

    // Groups container
    const groupsContainer = createElement('div', {
      flex: '1',
      overflowY: 'auto',
      padding: isMobile ? '16px' : '20px',
      WebkitOverflowScrolling: 'touch'
    }, { id: 'groups-container' });

    // Footer
    const footer = createElement('div', {
      padding: isMobile ? '16px' : '20px',
      borderTop: '1px solid #333'
    });

    const selectionCount = createElement('div', {
      fontFamily: 'system-ui',
      fontSize: isMobile ? '13px' : '14px',
      color: '#999',
      textAlign: 'center',
      marginBottom: '12px'
    }, { id: 'selection-count' });

    const footerButtons = createElement('div', {
      display: 'flex',
      gap: '12px'
    });

    const cancelBtn = createElement('button', {
      padding: isMobile ? '14px 20px' : '10px 20px',
      border: '1px solid #444',
      borderRadius: '6px',
      background: '#2a2a2a',
      color: '#fff',
      cursor: 'pointer',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '15px' : '14px',
      flex: '1',
      minHeight: isMobile ? '50px' : 'auto'
    }, { id: 'cancel-btn' });
    cancelBtn.textContent = 'Cancel';

    const extractBtn = createElement('button', {
      padding: isMobile ? '14px 20px' : '10px 20px',
      border: 'none',
      borderRadius: '6px',
      background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
      color: 'white',
      cursor: 'pointer',
      fontFamily: 'system-ui',
      fontSize: isMobile ? '15px' : '14px',
      fontWeight: '600',
      flex: '1',
      minHeight: isMobile ? '50px' : 'auto'
    }, { id: 'extract-btn' });
    extractBtn.textContent = 'Copy Selected';

    footerButtons.appendChild(cancelBtn);
    footerButtons.appendChild(extractBtn);
    footer.appendChild(selectionCount);
    footer.appendChild(footerButtons);

    // Assemble dialog
    dialog.appendChild(header);
    dialog.appendChild(controlsSection);
    dialog.appendChild(groupsContainer);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);

    let currentGroups = {};

    // Analyze URLs
    let maxSegments = 0;
    let maxDepth = 0;

    allLinks.forEach(url => {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        maxSegments = Math.max(maxSegments, pathParts.length);
        maxDepth = Math.max(maxDepth, pathParts.length);
      } catch (e) {}
    });

    // Populate dropdowns
    for (let i = 1; i <= maxSegments; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = i === 1 ? `1st (first)` :
                          i === maxSegments ? `${i}th (last)` :
                          `${i}th`;
      segmentPosition.appendChild(option);
    }

    for (let i = 1; i <= maxDepth; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${i} level${i > 1 ? 's' : ''}`;
      depthLevel.appendChild(option);
    }

    function renderGroups() {
      const groupBy = groupBySelect.value;

      // Show/hide controls
      if (groupBy === 'pattern-segment') {
        segmentControls.style.display = 'flex';
        depthControls.style.display = 'none';
      } else if (groupBy === 'pattern-depth') {
        segmentControls.style.display = 'none';
        depthControls.style.display = 'flex';
      } else {
        segmentControls.style.display = 'none';
        depthControls.style.display = 'none';
      }

      const selectedSegment = parseInt(segmentPosition.value) || 1;
      const selectedDepth = parseInt(depthLevel.value) || 1;

      currentGroups = groupLinks(allLinks, groupBy, selectedSegment, selectedDepth);

      groupsContainer.textContent = ''; // Clear container

      // Sort groups
      const sortedGroupKeys = Object.keys(currentGroups).sort((a, b) => {
        if (groupBy.startsWith('pattern')) {
          return a.localeCompare(b);
        } else {
          return currentGroups[b].length - currentGroups[a].length;
        }
      });

      sortedGroupKeys.forEach(groupKey => {
        const urls = currentGroups[groupKey];

        const groupDiv = createElement('div', {
          marginBottom: '12px',
          border: '1px solid #333',
          borderRadius: '8px',
          overflow: 'hidden',
          transition: 'all 0.2s'
        });

        const header = createElement('div', {
          display: 'flex',
          alignItems: 'center',
          padding: '16px',
          background: '#252525',
          cursor: 'pointer',
          userSelect: 'none'
        });
        header.setAttribute('data-group-key', groupKey);
        header.className = 'group-header';

        const checkbox = createElement('input', {
          marginRight: '12px',
          width: isMobile ? '24px' : '20px',
          height: isMobile ? '24px' : '20px',
          cursor: 'pointer'
        });
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.className = 'group-checkbox';

        const textContainer = createElement('div', { flex: '1' });

        const groupTitle = createElement('div', {
          fontFamily: 'system-ui',
          fontSize: '14px',
          fontWeight: '600',
          color: '#fff'
        });
        groupTitle.textContent = groupKey;

        const groupCount = createElement('div', {
          fontFamily: 'system-ui',
          fontSize: '12px',
          color: '#888',
          marginTop: '4px'
        });
        groupCount.textContent = `${urls.length} link${urls.length !== 1 ? 's' : ''}`;

        textContainer.appendChild(groupTitle);
        textContainer.appendChild(groupCount);

        const previewBtn = createElement('button', {
          padding: isMobile ? '8px 14px' : '6px 12px',
          border: '1px solid #444',
          borderRadius: '4px',
          background: '#2a2a2a',
          color: '#fff',
          cursor: 'pointer',
          fontSize: isMobile ? '13px' : '12px',
          minHeight: isMobile ? '40px' : 'auto'
        });
        previewBtn.className = 'preview-btn';
        previewBtn.textContent = 'Preview';

        const preview = createElement('div', {
          display: 'none',
          padding: '16px',
          background: '#1a1a1a',
          maxHeight: '200px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: isMobile ? '11px' : '12px'
        });
        preview.className = 'group-preview';

        header.appendChild(checkbox);
        header.appendChild(textContainer);
        header.appendChild(previewBtn);
        groupDiv.appendChild(header);
        groupDiv.appendChild(preview);

        // Event listeners
        header.addEventListener('click', (e) => {
          if (e.target !== previewBtn && e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            updateCount();
          }
        });

        checkbox.addEventListener('change', updateCount);

        previewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (preview.style.display === 'none') {
            // Build preview content
            preview.textContent = '';
            urls.slice(0, 10).forEach(url => {
              const urlDiv = createElement('div', {
                padding: '4px 0',
                color: '#999',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              });
              urlDiv.textContent = url;
              preview.appendChild(urlDiv);
            });
            if (urls.length > 10) {
              const moreDiv = createElement('div', {
                padding: '8px 0',
                color: '#666',
                fontStyle: 'italic'
              });
              moreDiv.textContent = `... and ${urls.length - 10} more`;
              preview.appendChild(moreDiv);
            }
            preview.style.display = 'block';
            previewBtn.textContent = 'Hide';
          } else {
            preview.style.display = 'none';
            previewBtn.textContent = 'Preview';
          }
        });

        groupsContainer.appendChild(groupDiv);
      });

      updateCount();
    }

    function updateCount() {
      const selectedGroups = Array.from(groupsContainer.querySelectorAll('.group-checkbox:checked'));
      let totalSelected = 0;

      selectedGroups.forEach(checkbox => {
        const groupHeader = checkbox.closest('.group-header');
        const groupKey = groupHeader.getAttribute('data-group-key');
        totalSelected += currentGroups[groupKey]?.length || 0;
      });

      selectionCount.textContent = `${totalSelected} link${totalSelected !== 1 ? 's' : ''} selected`;
    }

    groupBySelect.addEventListener('change', renderGroups);
    segmentPosition.addEventListener('change', renderGroups);
    depthLevel.addEventListener('change', renderGroups);

    selectAllBtn.addEventListener('click', () => {
      groupsContainer.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = true);
      updateCount();
    });

    deselectAllBtn.addEventListener('click', () => {
      groupsContainer.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = false);
      updateCount();
    });

    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });

    extractBtn.addEventListener('click', () => {
      const selectedGroups = Array.from(groupsContainer.querySelectorAll('.group-checkbox:checked'));
      const selectedUrls = [];

      selectedGroups.forEach(checkbox => {
        const groupHeader = checkbox.closest('.group-header');
        const groupKey = groupHeader.getAttribute('data-group-key');

        if (currentGroups[groupKey]) {
          selectedUrls.push(...currentGroups[groupKey]);
        }
      });

      document.body.removeChild(overlay);
      resolve(selectedUrls);
    });

    document.body.appendChild(overlay);
    renderGroups();
  });
}

async function extractLinks() {
  notify('Scanning page...', '#3b82f6');

  try {
    const allUrls = [];

    document.querySelectorAll('a[href]').forEach(a => {
      try {
        const url = new URL(a.href, window.location.href);

        if (url.href.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|js|css|mp4|webm|mp3|wav|ogg|woff|woff2|ttf|eot)(\?|#|$)/i)) {
          return;
        }

        if (url.protocol === 'javascript:' || url.protocol === 'mailto:') {
          return;
        }

        allUrls.push(url.href);
      } catch (e) {}
    });

    if (allUrls.length === 0) {
      throw new Error('No links found on this page');
    }

    const uniqueUrls = [...new Set(allUrls)];
    const selectedUrls = await showGroupingDialog(uniqueUrls);

    if (!selectedUrls || selectedUrls.length === 0) {
      notify('No links selected', '#666', 2000);
      return;
    }

    const plainList = selectedUrls.sort().join('\n');

    try {
      await navigator.clipboard.writeText(plainList);
      notify(`✅ Copied ${selectedUrls.length} links!`, '#10b981', 4000);
    } catch (clipboardError) {
      const textarea = document.createElement('textarea');
      textarea.value = plainList;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        notify(`✅ Copied ${selectedUrls.length} links!`, '#10b981', 4000);
      } catch (fallbackError) {
        document.body.removeChild(textarea);
        throw new Error('Failed to copy to clipboard');
      }
    }

  } catch (error) {
    console.error('Error:', error);
    notify(`❌ ${error.message}`, '#ef4444', 5000);
  }
}

function createButton() {
  const btn = document.createElement('button');
  btn.textContent = '🔗';
  btn.title = 'Extract links with grouping';

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

  btn.style.cssText = isMobile ? `
    position: fixed; top: 70px; left: 16px;
    z-index: 999999; width: 44px; height: 44px;
    border-radius: 50%; border: none;
    background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
    color: white; font-size: 18px; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    transition: all 0.2s ease; touch-action: manipulation;
  ` : `
    position: fixed; bottom: 24px; left: 24px;
    z-index: 999999; padding: 12px 20px; border-radius: 24px;
    border: none; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
    color: white; font-size: 14px; font-weight: 600;
    font-family: system-ui; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    transition: all 0.2s ease;
  `;

  if (!isMobile) {
    btn.textContent = '🔗 Copy Links';
  }

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.05)';
    btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
  });

  btn.addEventListener('click', extractLinks);

  return btn;
}

function init() {
  if (document.body) {
    const btn = createButton();
    document.body.appendChild(btn);
    console.log('🔗 Advanced Link Extractor (Dark + Mobile - YouTube Compatible) loaded');
  } else {
    setTimeout(init, 500);
  }
}

init();

})();
