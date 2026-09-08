/**
 * GitHub & jsDelivr Auto-Save Vault Module
 * 
 * Automatically commits every weekly missionary diary entry, daily polaroid photo,
 * and markdown journal into the GitHub repository (AllensCreations/gmail-diary-vault),
 * making every entry indestructible, permanent, and instantly accessible worldwide
 * via the free, high-speed jsDelivr Multi-CDN edge network.
 */

const GITHUB_API = 'https://api.github.com';

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'AllensCreations/gmail-diary-vault';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const jsdelivrBase = `https://cdn.jsdelivr.net/gh/${repo}@${branch}`;

  return {
    enabled: Boolean(token),
    token,
    repo,
    branch,
    jsdelivrBase
  };
}

/**
 * Commits a weekly diary payload to GitHub and returns jsDelivr CDN URLs.
 */
async function autoSaveToGitHub(payload) {
  const config = getGitHubConfig();
  if (!config.enabled) {
    console.log('[github-vault] GITHUB_TOKEN not configured in environment. Skipping GitHub/jsDelivr auto-save.');
    return { skipped: true, reason: 'GITHUB_TOKEN_NOT_SET' };
  }

  const { token, repo, branch, jsdelivrBase } = config;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Elder-Salviejo-Diary-Vault/1.0'
  };

  try {
    console.log(`[github-vault] Starting auto-save to GitHub: ${repo}@${branch}...`);

    // 1. Get latest commit SHA on the target branch
    const refRes = await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${branch}`, {
      headers: authHeaders
    });
    if (!refRes.ok) {
      throw new Error(`Failed to get branch ref: HTTP ${refRes.status} - ${await refRes.text()}`);
    }
    const refData = await refRes.json();
    const baseCommitSha = refData.object.sha;

    // 2. Get tree SHA of the latest commit
    const commitRes = await fetch(`${GITHUB_API}/repos/${repo}/git/commits/${baseCommitSha}`, {
      headers: authHeaders
    });
    if (!commitRes.ok) {
      throw new Error(`Failed to get base commit: HTTP ${commitRes.status}`);
    }
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    const treeItems = [];
    const photoCdnMap = {};
    const newGalleryPhotos = [];
    let photoIndex = 0;

    // 3. Process entries and upload photos as binary Git blobs
    const processedEntries = [];
    for (const entry of payload.entries || []) {
      photoIndex++;
      const dayLower = (entry.day || `photo_${photoIndex}`).toLowerCase();
      let cdnImageUrl = null;

      if (entry.image && typeof entry.image === 'string' && entry.image.startsWith('data:image/')) {
        try {
          const match = entry.image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (match) {
            const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            const base64Data = match[2];

            // Create Git blob for binary image
            const blobRes = await fetch(`${GITHUB_API}/repos/${repo}/git/blobs`, {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: base64Data,
                encoding: 'base64'
              })
            });

            if (blobRes.ok) {
              const blobData = await blobRes.json();

              // A. Dedicated jsDelivr Gallery Folder: vault/gallery/photos/
              // All uploaded gallery photos and weekly journal photos are stored here
              const galleryPhotoPath = `vault/gallery/photos/${payload.slug}-${photoIndex}.${ext}`;
              treeItems.push({
                path: galleryPhotoPath,
                mode: '100644',
                type: 'blob',
                sha: blobData.sha
              });

              const galleryCdnUrl = `${jsdelivrBase}/${galleryPhotoPath}`;
              newGalleryPhotos.push({
                id: `gallery-${payload.slug}-${photoIndex}`,
                src: galleryCdnUrl,
                filename: `${payload.slug}-${photoIndex}.${ext}`,
                uploadedAt: payload.publishedAt || new Date().toISOString(),
                source: payload.isGallery ? 'gallery' : 'journal',
                category: entry.category || payload.category || (payload.isGallery ? 'Mission' : 'P-Day Journal'),
                slug: payload.slug
              });

              // B. For weekly diaries, also maintain vault/photos/
              if (!payload.isGallery) {
                const diaryPhotoPath = `vault/photos/${payload.slug}-${dayLower}.${ext}`;
                treeItems.push({
                  path: diaryPhotoPath,
                  mode: '100644',
                  type: 'blob',
                  sha: blobData.sha
                });
                cdnImageUrl = `${jsdelivrBase}/${diaryPhotoPath}`;
                photoCdnMap[dayLower] = cdnImageUrl;
              } else {
                cdnImageUrl = galleryCdnUrl;
                photoCdnMap[dayLower] = cdnImageUrl;
              }
            }
          }
        } catch (photoErr) {
          console.warn(`[github-vault] Photo blob upload failed for ${entry.day || photoIndex}:`, photoErr.message);
        }
      }

      processedEntries.push({
        ...entry,
        cdnImage: cdnImageUrl || entry.image
      });
    }

    // 4. Update master vault/gallery/index.json (Dedicated Gallery Folder)
    if (newGalleryPhotos.length > 0) {
      try {
        const existingGallery = await fetchExistingJsonFile(repo, branch, 'vault/gallery/index.json', authHeaders);
        const updatedGallery = existingGallery.filter(item => item.slug !== payload.slug);
        updatedGallery.unshift(...newGalleryPhotos);
        // Sort descending by upload date
        updatedGallery.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        treeItems.push({
          path: 'vault/gallery/index.json',
          mode: '100644',
          type: 'blob',
          content: JSON.stringify(updatedGallery, null, 2)
        });
      } catch (galleryErr) {
        console.warn('[github-vault] Could not update vault/gallery/index.json:', galleryErr.message);
      }
    }

    // 5. If weekly diary, generate Markdown, structured JSON, and update vault/index.json
    if (!payload.isGallery) {
      const markdownContent = buildMarkdownLetter(payload, processedEntries);
      treeItems.push({
        path: `vault/diaries/${payload.slug}.md`,
        mode: '100644',
        type: 'blob',
        content: markdownContent
      });

      const jsonContent = JSON.stringify({
        slug: payload.slug,
        title: payload.title,
        publishedAt: payload.publishedAt,
        rawSubject: payload.rawSubject,
        sender: payload.sender,
        verse: payload.verse,
        totalEntries: payload.totalEntries || processedEntries.length,
        imageCount: payload.imageCount,
        entries: processedEntries,
        jsdelivr: {
          rawJson: `${jsdelivrBase}/vault/diaries/${payload.slug}.json`,
          markdown: `${jsdelivrBase}/vault/diaries/${payload.slug}.md`
        }
      }, null, 2);

      treeItems.push({
        path: `vault/diaries/${payload.slug}.json`,
        mode: '100644',
        type: 'blob',
        content: jsonContent
      });

      try {
        const existingIndex = await fetchExistingJsonFile(repo, branch, 'vault/index.json', authHeaders);
        const updatedIndex = existingIndex.filter(w => w.slug !== payload.slug);
        updatedIndex.unshift({
          slug: payload.slug,
          title: payload.title,
          publishedAt: payload.publishedAt,
          entriesCount: processedEntries.length,
          imageCount: payload.imageCount,
          verse: payload.verse ? payload.verse.reference : null,
          previewImage: processedEntries[0] ? (processedEntries[0].cdnImage || null) : null,
          viewUrl: `/week/${payload.slug}`,
          cdnJsonUrl: `${jsdelivrBase}/vault/diaries/${payload.slug}.json`
        });

        updatedIndex.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

        treeItems.push({
          path: 'vault/index.json',
          mode: '100644',
          type: 'blob',
          content: JSON.stringify(updatedIndex, null, 2)
        });
      } catch (indexErr) {
        console.warn('[github-vault] Could not update vault/index.json:', indexErr.message);
      }
    }

    // 6. Create Git Tree
    const newTreeRes = await fetch(`${GITHUB_API}/repos/${repo}/git/trees`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });
    if (!newTreeRes.ok) {
      throw new Error(`Failed to create Git tree: HTTP ${newTreeRes.status} - ${await newTreeRes.text()}`);
    }
    const newTreeData = await newTreeRes.json();

    // 7. Create Git Commit
    const commitMsg = payload.isGallery
      ? `Auto-save polaroid gallery: "${payload.title}" (${newGalleryPhotos.length} photos) [jsDelivr Gallery]`
      : `Auto-save weekly diary & gallery: "${payload.title}" [jsDelivr Vault]`;

    const newCommitRes = await fetch(`${GITHUB_API}/repos/${repo}/git/commits`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: commitMsg,
        tree: newTreeData.sha,
        parents: [baseCommitSha]
      })
    });
    if (!newCommitRes.ok) {
      throw new Error(`Failed to create Git commit: HTTP ${newCommitRes.status} - ${await newCommitRes.text()}`);
    }
    const newCommitData = await newCommitRes.json();

    // 8. Update branch ref (push commit)
    const updateRefRes = await fetch(`${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sha: newCommitData.sha,
        force: false
      })
    });
    if (!updateRefRes.ok) {
      throw new Error(`Failed to update branch ref: HTTP ${updateRefRes.status} - ${await updateRefRes.text()}`);
    }

    console.log(`[github-vault] Successfully committed to GitHub! Commit: ${newCommitData.sha.substring(0, 7)}`);

    // 9. Purge jsDelivr cache asynchronously so newly updated files reflect immediately
    const purgeUrls = [
      `${jsdelivrBase}/vault/gallery/index.json`
    ];
    if (!payload.isGallery) {
      purgeUrls.push(
        `${jsdelivrBase}/vault/index.json`,
        `${jsdelivrBase}/vault/diaries/${payload.slug}.json`,
        `${jsdelivrBase}/vault/diaries/${payload.slug}.md`
      );
    }
    purgeJsdelivr(purgeUrls).catch(() => {});

    return {
      success: true,
      commitSha: newCommitData.sha,
      jsdelivr: {
        index: `${jsdelivrBase}/vault/index.json`,
        diaryJson: !payload.isGallery ? `${jsdelivrBase}/vault/diaries/${payload.slug}.json` : null,
        diaryMarkdown: !payload.isGallery ? `${jsdelivrBase}/vault/diaries/${payload.slug}.md` : null,
        photos: photoCdnMap,
        galleryFolder: `${jsdelivrBase}/vault/gallery/`,
        galleryIndex: `${jsdelivrBase}/vault/gallery/index.json`,
        galleryPhotos: newGalleryPhotos
      }
    };
  } catch (err) {
    console.error('[github-vault] Error in autoSaveToGitHub:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Fetches existing JSON file from GitHub if it exists.
 */
async function fetchExistingJsonFile(repo, branch, filePath, authHeaders) {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}?ref=${branch}`, {
      headers: authHeaders
    });
    if (res.ok) {
      const data = await res.json();
      if (data.content) {
        const text = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(text);
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Builds a clean Markdown document for reading on GitHub or Obsidian.
 */
function buildMarkdownLetter(payload, entries) {
  const pubDate = payload.publishedAt ? new Date(payload.publishedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'Weekly Journal';

  let md = `# ${payload.title}\n\n`;
  md += `> **Elder Salviejo • Philippines Dumaguete Mission**  \n`;
  md += `> *Published on: ${pubDate}*\n\n`;

  if (payload.verse && payload.verse.reference) {
    md += `### Weekly Scripture: ${payload.verse.reference}\n\n`;
    if (payload.verse.text) {
      md += `> "${payload.verse.text}"\n\n`;
    }
  }

  md += `---\n\n`;

  for (const entry of entries) {
    md += `## ${entry.day || 'DAILY REFLECTION'}\n\n`;
    if (entry.cdnImage) {
      md += `![${entry.day} Photo](${entry.cdnImage})\n\n`;
    }
    if (entry.text) {
      md += `${entry.text}\n\n`;
    }
    md += `---\n\n`;
  }

  md += `*Archived automatically via Elder Salviejo Diary Vault*\n`;
  return md;
}

/**
 * Pings jsDelivr's purge API so newly pushed files are purged from CDN caches
 */
async function purgeJsdelivr(urls) {
  for (const url of urls) {
    try {
      const purgeUrl = url.replace('https://cdn.jsdelivr.net/', 'https://purge.jsdelivr.net/');
      await fetch(purgeUrl, { method: 'GET' });
    } catch (_) {}
  }
}

module.exports = {
  getGitHubConfig,
  autoSaveToGitHub
};
