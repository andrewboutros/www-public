(function(){
  var host = document.getElementById('fabric');
  try {
    if (host && window.Fabric) window.Fabric.mount(host);
  } catch (e) {
    // the graphic is decorative: never let it take the page down
    if (window.console) console.error('Fabric failed to start:', e);
    if (host) host.style.display = 'none';
  }

  var newsPagers = document.querySelectorAll('[data-news-pager]');
  Array.prototype.forEach.call(newsPagers, function(pager) {
    if (typeof pager.querySelectorAll !== 'function' || typeof pager.querySelector !== 'function') return;
    var items = pager.querySelectorAll('.news > li');
    var previous = pager.querySelector('[data-news-previous]');
    var next = pager.querySelector('[data-news-next]');
    var status = pager.querySelector('[data-news-page-status]');
    var pageSize = Number(pager.getAttribute('data-page-size'));
    var pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    var page = 0;
    if (!items.length || !previous || !next || !status || !pageSize) return;

    function showNewsPage(nextPage) {
      page = Math.max(0, Math.min(pageCount - 1, nextPage));
      var first = page * pageSize;
      Array.prototype.forEach.call(items, function(item, index) {
        item.hidden = index < first || index >= first + pageSize;
      });
      previous.disabled = page === 0;
      next.disabled = page === pageCount - 1;
      status.textContent = status.getAttribute('data-page-label') + ' ' + (page + 1) + ' ' +
        status.getAttribute('data-of-label') + ' ' + pageCount;
      pager.setAttribute('data-news-page', String(page + 1));
    }

    previous.addEventListener('click', function() { showNewsPage(page - 1); });
    next.addEventListener('click', function() { showNewsPage(page + 1); });
    showNewsPage(0);
  });

  var teamToggles = document.querySelectorAll('.team-profile-toggle');
  Array.prototype.forEach.call(teamToggles, function(toggle) {
    toggle.addEventListener('click', function() {
      var panel = document.getElementById(toggle.getAttribute('aria-controls'));
      var willOpen = toggle.getAttribute('aria-expanded') !== 'true';

      Array.prototype.forEach.call(teamToggles, function(otherToggle) {
        var otherPanel = document.getElementById(otherToggle.getAttribute('aria-controls'));
        otherToggle.setAttribute('aria-expanded', 'false');
        if (otherPanel) otherPanel.hidden = true;
      });

      if (willOpen && panel) {
        toggle.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
      }
    });
  });

  var galleryLightbox = document.getElementById('gallery-lightbox');
  var galleryItems = document.querySelectorAll('.gallery-item[data-gallery-src]');
  if (galleryLightbox && typeof galleryLightbox.showModal === 'function') {
    var galleryImage = galleryLightbox.querySelector('img');
    var galleryCaption = galleryLightbox.querySelector('figcaption');
    var galleryClose = galleryLightbox.querySelector('.gallery-lightbox-close');
    var galleryPrevious = galleryLightbox.querySelector('.gallery-lightbox-previous');
    var galleryNext = galleryLightbox.querySelector('.gallery-lightbox-next');
    var galleryIndex = 0;

    function showGalleryImage(index) {
      galleryIndex = (index + galleryItems.length) % galleryItems.length;
      var item = galleryItems[galleryIndex];
      var caption = item.getAttribute('data-gallery-caption');
      galleryImage.src = item.getAttribute('data-gallery-src');
      galleryImage.alt = caption;
      galleryCaption.textContent = caption;
    }

    Array.prototype.forEach.call(galleryItems, function(item, index) {
      item.addEventListener('click', function(event) {
        event.preventDefault();
        showGalleryImage(index);
        galleryLightbox.showModal();
      });
    });
    galleryPrevious.addEventListener('click', function() {
      showGalleryImage(galleryIndex - 1);
    });
    galleryNext.addEventListener('click', function() {
      showGalleryImage(galleryIndex + 1);
    });
    galleryClose.addEventListener('click', function() {
      galleryLightbox.close();
    });
    galleryLightbox.addEventListener('keydown', function(event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showGalleryImage(galleryIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        showGalleryImage(galleryIndex + 1);
      }
    });
    galleryLightbox.addEventListener('click', function(event) {
      if (event.target === galleryLightbox) galleryLightbox.close();
    });
    galleryLightbox.addEventListener('close', function() {
      galleryImage.removeAttribute('src');
    });
  }

  var familyTrees = document.querySelectorAll('[data-family-tree]');
  Array.prototype.forEach.call(familyTrees, function(tree) {
    if (typeof tree.querySelector !== 'function') return;
    var svg = tree.querySelector('.family-svg');
    var viewport = tree.querySelector('.family-viewport');
    var nodes = tree.querySelectorAll('.family-node[data-person-id]');
    var edges = tree.querySelectorAll('.family-edge[data-advisor][data-student]');
    var details = tree.querySelectorAll('[data-family-detail]');
    var prompt = tree.querySelector('.family-detail-prompt');
    var search = tree.querySelector('[data-family-search]');
    if (!svg || !viewport || !nodes.length) return;

    function parseBox(value) {
      return String(value).trim().split(/\s+/).map(Number);
    }
    var home = parseBox(svg.getAttribute('data-home-view'));
    var canvas = parseBox(svg.getAttribute('data-canvas-view'));
    var box = parseBox(svg.getAttribute('viewBox'));

    function constrain(next) {
      next[2] = Math.max(260, Math.min(canvas[2], next[2]));
      next[3] = Math.max(180, Math.min(canvas[3], next[3]));
      next[0] = Math.max(canvas[0], Math.min(canvas[0] + canvas[2] - next[2], next[0]));
      next[1] = Math.max(canvas[1], Math.min(canvas[1] + canvas[3] - next[3], next[1]));
      return next;
    }
    function drawBox(next) {
      box = constrain(next);
      svg.setAttribute('viewBox', box.join(' '));
    }
    function zoom(factor, centerX, centerY) {
      var x = centerX == null ? box[0] + box[2] / 2 : centerX;
      var y = centerY == null ? box[1] + box[3] / 2 : centerY;
      var nextWidth = box[2] * factor;
      var nextHeight = box[3] * factor;
      drawBox([
        x - (x - box[0]) * nextWidth / box[2],
        y - (y - box[1]) * nextHeight / box[3],
        nextWidth,
        nextHeight
      ]);
    }
    function nodeById(personId) {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('data-person-id') === personId) return nodes[i];
      }
      return null;
    }
    function centerNode(node) {
      var transform = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(node.getAttribute('transform'));
      var rect = node.querySelector('.family-node-box');
      if (!transform || !rect) return;
      var centerX = Number(transform[1]) + Number(rect.getAttribute('width')) / 2;
      var centerY = Number(transform[2]) + Number(rect.getAttribute('height')) / 2;
      drawBox([centerX - box[2] / 2, centerY - box[3] / 2, box[2], box[3]]);
    }
    function selectPerson(personId, shouldCenter) {
      var selected = nodeById(personId);
      if (!selected) return;
      var lineage = {};
      function collect(node) {
        var id = node.getAttribute('data-person-id');
        if (lineage[id]) return;
        lineage[id] = true;
        String(node.getAttribute('data-advisors') || '').split(/\s+/).forEach(function(advisorId) {
          if (advisorId) collect(nodeById(advisorId));
        });
      }
      collect(selected);
      tree.classList.add('has-selection');
      Array.prototype.forEach.call(nodes, function(node) {
        var id = node.getAttribute('data-person-id');
        node.classList.toggle('is-selected', id === personId);
        node.classList.toggle('is-lineage', !!lineage[id] && id !== personId);
      });
      Array.prototype.forEach.call(edges, function(edge) {
        edge.classList.toggle('is-lineage',
          !!lineage[edge.getAttribute('data-advisor')] && !!lineage[edge.getAttribute('data-student')]);
      });
      Array.prototype.forEach.call(details, function(detail) {
        detail.hidden = detail.getAttribute('data-family-detail') !== personId;
      });
      if (prompt) prompt.hidden = true;
      if (search) search.value = selected.getAttribute('aria-label').split(',')[0];
      if (shouldCenter) {
        if (box[2] >= canvas[2] * 0.95) {
          box[2] = home[2];
          box[3] = home[3];
        }
        centerNode(selected);
      }
    }

    Array.prototype.forEach.call(nodes, function(node) {
      node.addEventListener('click', function() {
        selectPerson(node.getAttribute('data-person-id'), false);
      });
      node.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectPerson(node.getAttribute('data-person-id'), false);
        }
      });
    });
    Array.prototype.forEach.call(tree.querySelectorAll('[data-family-select]'), function(button) {
      button.addEventListener('click', function() {
        selectPerson(button.getAttribute('data-family-select'), true);
      });
    });

    var drag = null;
    svg.addEventListener('pointerdown', function(event) {
      if (event.button !== 0 || event.target.closest('.family-node')) return;
      drag = { x: event.clientX, y: event.clientY, box: box.slice() };
      svg.classList.add('is-dragging');
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', function(event) {
      if (!drag) return;
      var rect = svg.getBoundingClientRect();
      drawBox([
        drag.box[0] - (event.clientX - drag.x) * drag.box[2] / rect.width,
        drag.box[1] - (event.clientY - drag.y) * drag.box[3] / rect.height,
        drag.box[2], drag.box[3]
      ]);
    });
    function endDrag(event) {
      if (!drag) return;
      drag = null;
      svg.classList.remove('is-dragging');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('wheel', function(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      var rect = svg.getBoundingClientRect();
      var centerX = box[0] + (event.clientX - rect.left) / rect.width * box[2];
      var centerY = box[1] + (event.clientY - rect.top) / rect.height * box[3];
      zoom(event.deltaY < 0 ? 0.86 : 1.16, centerX, centerY);
    }, { passive: false });

    var zoomIn = tree.querySelector('[data-family-zoom="in"]');
    var zoomOut = tree.querySelector('[data-family-zoom="out"]');
    var fitButton = tree.querySelector('[data-family-fit]');
    if (zoomIn) zoomIn.addEventListener('click', function() { zoom(0.8); });
    if (zoomOut) zoomOut.addEventListener('click', function() { zoom(1.25); });
    if (fitButton) fitButton.addEventListener('click', function() { drawBox(canvas.slice()); });
    if (search) {
      function selectSearchResult() {
        var query = search.value.trim().toLocaleLowerCase();
        if (!query) return;
        var match = null;
        Array.prototype.some.call(nodes, function(node) {
          var name = node.getAttribute('data-person-name');
          if (name === query || (!match && name.indexOf(query) !== -1)) {
            match = node;
            return name === query;
          }
          return false;
        });
        if (match) selectPerson(match.getAttribute('data-person-id'), true);
      }
      search.addEventListener('change', selectSearchResult);
      search.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') selectSearchResult();
      });
    }
  });

  var viewBadges = document.querySelectorAll('[data-pdf-view-url]');
  if (!viewBadges.length || !window.fetch) return;

  Array.prototype.forEach.call(viewBadges, function(badge) {
    var countNode = badge.querySelector('.pdf-view-count');
    window.fetch(badge.getAttribute('data-pdf-view-url'), {
      mode: 'cors',
      credentials: 'omit'
    }).then(function(response) {
      if (response.status === 404) return { count: '0' };
      if (!response.ok) throw new Error('PDF count request failed: ' + response.status);
      return response.json();
    }).then(function(data) {
      if (!data || !/^\d[\d,.\s]*$/.test(String(data.count))) {
        throw new Error('PDF count response was invalid');
      }
      var count = String(data.count);
      var numericCount = Number(count.replace(/[,.\s]/g, ''));
      var label = count + ' PDF view' + (numericCount === 1 ? '' : 's');
      countNode.textContent = count;
      badge.setAttribute('aria-label', label);
      badge.setAttribute('title', label);
    }).catch(function(error) {
      badge.classList.add('is-unavailable');
      badge.setAttribute('aria-label', 'PDF view count unavailable');
      badge.setAttribute('title', 'PDF view count unavailable');
      if (window.console) console.warn(error.message);
    });
  });

})();
