const audio = document.getElementById('myAudio');
const timeEl = document.getElementById('time');
const lyricsEl = document.getElementById('lyrics')
const progressBar = document.getElementById('progress-bar');
const progress = document.getElementById('progress');
const progressHandle = document.getElementById('progress-handle');
var lyricData;
var isDragging = false;
let pendingTime = null; // 用于存储拖动结束后要跳转的时间

// 初始化进度条事件监听
function initProgressBar() {
    // 点击进度条跳转
    progressBar.addEventListener('click', (e) => {
        if (audio.duration) {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audio.currentTime = percent * audio.duration;
        }
    });

    // 拖动进度条
    progressHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging && audio.duration) {
            const rect = progressBar.getBoundingClientRect();
            let percent = (e.clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent)); // 限制在 0-1 范围内

            // 🚫 不再设置 audio.currentTime
            // audio.currentTime = percent * audio.duration;

            // ✅ 只更新 UI：progress 宽度和 handle 位置
            const percentPercent = percent * 100;
            progress.style.width = percentPercent + '%';
            progressHandle.style.left = percentPercent + '%';

            // 🧠 可选：保存当前拖动位置对应的时间（但不立即使用）
            pendingTime = percent * audio.duration;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging && pendingTime !== null && audio.duration) {
            // 🎵 真正设置音频时间
            audio.currentTime = pendingTime;

            // 🧹 清理状态
            isDragging = false;
            pendingTime = null;
        } else {
            isDragging = false;
        }
    });

    document.addEventListener('touchend', () => {
        if (isDragging && pendingTime !== null && audio.duration) {
            audio.currentTime = pendingTime;

            isDragging = false;
            pendingTime = null;
        } else {
            isDragging = false;
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            const rect = progressBar.getBoundingClientRect();
            let clientX = e.touches[0].clientX;
            let percent = (clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));

            // 🚫 不设置 audio.currentTime
            // audio.currentTime = percent * audio.duration;

            // ✅ 只更新 UI
            const percentPercent = percent * 100;
            progress.style.width = percentPercent + '%';
            progressHandle.style.left = percentPercent + '%';

            // 🧠 可选：记录拖动的目标时间
            pendingTime = percent * audio.duration;
        }
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initProgressBar();
});

function formatTime(s) {
    if (isNaN(s)) return '00:00';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

function changeAudioSource(newUrl) {
    audio.src = newUrl;
    // 可选：加载新音频
    audio.load();
    audio.play();
}

async function playSong(songId, name, artist, source, picId, lycId) {
    const urlApi = `https://music-api.gdstudio.xyz/api.php?types=url&source=${source}&id=${songId}&br=128`;
    const response = await fetch(urlApi);
    if (!response.ok) throw new Error('下载链接获取失败');

    const audioData = await response.json();
    var downloadUrl = '';
    const songName = document.getElementById('song-name')
    songName.textContent = name
    const author = document.getElementById('author')
    author.textContent = artist

    const cover = document.getElementById('cover')
    coverUrl = await getRealCoverUrl(source, picId)
    cover.src = coverUrl

    const lyricUrl = `https://music-api.gdstudio.xyz/api.php?types=lyric&source=${source}&id=${lycId}`
    const lyricRsp = await fetch(lyricUrl)
    lyricData = await lyricRsp.json()
    showLyrics(lyricData.lyric)

    if (audioData && audioData.url) {
        const proxiedAudioUrl = buildAudioProxyUrl(audioData.url);
        const preferredAudioUrl = preferHttpsUrl(audioData.url);

        downloadUrl = proxiedAudioUrl || preferredAudioUrl || audioData.url;

    }

    changeAudioSource(downloadUrl);
}

function showLyrics(lyricsStr) {
    if (!lyricsStr || lyricsStr.trim() === '') {
        lyricsEl.innerHTML = '<div class="lyric-line">暂无歌词</div>';
        return;
    }

    lyricData = parseLyrics(lyricsStr)

    renderLyrics(lyricData)
}

// 高亮当前歌词
function highlightCurrentLyric(currentTime) {
    if (!Array.isArray(lyricData) || lyricData.length === 0) {
        return;
    }
    let currentIndex = -1;
    for (let i = 0; i < lyricData.length; i++) {
        if (lyricData[i].time <= currentTime) {
            currentIndex = i;
        } else {
            break;
        }
    }

    // 移除所有高亮
    document.querySelectorAll('.lyric-line').forEach(el => {
        el.classList.remove('active');
    });

    // 高亮当前行
    if (currentIndex >= 0) {
        const currentLine = document.querySelector(`.lyric-line[data-index="${currentIndex}"]`);
        if (currentLine) {
            currentLine.classList.add('active');

            // 计算滚动位置
            const lyricsEl = document.getElementById("lyrics");

            const lineTop = currentLine.offsetTop;

            const containerHeight = lyricsEl.clientHeight;
            const lineHeight = currentLine.clientHeight;

            // 让当前行居中显示
            const targetScrollTop = lineTop - (containerHeight / 2) + (lineHeight / 2);

            lyricsEl.scrollTo({
                top: targetScrollTop,
                behavior: "smooth"
            });
        }
    }
}
// 渲染所有歌词
function renderLyrics(lyricData) {
    lyricsEl.innerHTML = '';
    lyricData.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'lyric-line';
        div.dataset.index = index;
        div.textContent = item.text || ' ';
        lyricsEl.appendChild(div);
    });
}

// 解析歌词
function parseLyrics(lyricText) {
    const lines = lyricText.trim().split('\n');
    const parsed = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

    lines.forEach(line => {
        let match;
        const times = [];
        let text = line;

        // 提取所有时间标签
        while ((match = timeRegex.exec(line)) !== null) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const ms = parseInt(match[3].padEnd(3, '0'), 10);
            const timeInSeconds = min * 60 + sec + ms / 1000;
            times.push(timeInSeconds);

            // 移除时间标签，获取纯文本
            text = text.replace(match[0], '').trim();
        }

        // 为每个时间标签创建歌词条目
        times.forEach(time => {
            parsed.push({ time, text });
        });
    });

    return parsed.sort((a, b) => a.time - b.time);
}


function togglePlay() {
    const audio = document.getElementById('myAudio')
    if (audio.paused) {
        audio.play()
    } else {
        audio.pause()
    }
}


function getRealCoverUrl(source, picId) {
    const picApiUrl = `https://music-api.gdstudio.xyz/api.php?types=pic&source=${source}&id=${picId}&size=300`;
    return fetch(picApiUrl)
        .then(response => {
            if (!response.ok) throw new Error('封面图链接获取失败');
            return response.json();
        })
        .then(picData => {
            return picData.url || 'https://via.placeholder.com/100?text=无封面';
        })
        .catch(error => {

            return 'https://via.placeholder.com/100?text=加载失败';
        });
}

async function searchMusic() {
    const keyword = document.getElementById('searchInput').value.trim();
    const selectedSource = document.getElementById('musicSource').value;
    if (!keyword) {
        alert('请输入搜索关键词（歌曲名/歌手名/专辑名）');
        return;
    }

    const searchApiUrl = `https://music-api.gdstudio.xyz/api.php?types=search&source=${selectedSource}&name=${encodeURIComponent(keyword)}&count=5&pages=1`;

    try {
        const searchResponse = await fetch(searchApiUrl);
        if (!searchResponse.ok) throw new Error('搜索请求失败');
        const songList = await searchResponse.json();
        const resultContainer = document.getElementById('resultContainer');
        resultContainer.innerHTML = '';

        if (!songList || songList.length === 0) {
            resultContainer.innerHTML = '<p style="color:#666;">未找到相关音乐，请尝试更换关键词或音乐源</p>';
            return;
        }

        for (const song of songList) {
            const realCoverUrl = await getRealCoverUrl(song.source, song.pic_id);
            const songCard = document.createElement('div');
            songCard.className = 'song-card';

            songCard.innerHTML = `
                        <img src="${realCoverUrl}" alt="${song.album} 封面">
                        <div class="song-info">
                            <p><strong>歌曲名：</strong>${song.name}</p>
                            <p><strong>歌手：</strong>${song.artist.join(', ')}</p>
                            <p><strong>专辑：</strong>${song.album}</p>
                            <p><strong>当前音乐源：</strong>${document.getElementById('musicSource').options[document.getElementById('musicSource').selectedIndex].text}</p>
                            <button onclick="playSong('${song.id}', '${song.name}', '${song.artist.join(', ')}', '${song.source}', '${song.pic_id}', '${song.lyric_id}')">播放</button>
                            <button onclick="downloadSongById('${song.id}', '${song.name}', '${song.artist.join(', ')}', '${song.source}')">下载</button>
                        </div>
                    `;
            resultContainer.appendChild(songCard);
        }
    } catch (error) {
        document.getElementById('resultContainer').innerHTML = `<p style="color:#dc3545;">搜索失败：${error.message}</p>`;
    }
}

// async function downloadSong(source, songId, songName) {
//     try {
//         // 获取音乐文件的URL
//         const urlApi = `https://music-api.gdstudio.xyz/api.php?types=url&source=${source}&id=${songId}&br=128`;
//         const response = await fetch(urlApi);
//         if (!response.ok) throw new Error('下载链接获取失败');
//         const data = await response.json();

//         // 假设data.url是音乐文件的直接链接
//         const musicUrl = data.url;

//         // 创建一个临时的a标签，设置href为音乐文件的URL，并触发点击
//         const a = document.createElement('a');
//         a.href = musicUrl;
//         a.download = songName + '.mp3'; // 设置下载文件名
//         document.body.appendChild(a);
//         a.click();
//         document.body.removeChild(a);
//     } catch (err) {
//         alert('下载失败: ' + err.message);
//     }
// }


async function downloadSongById(songId, songName, artist, source) {
    const song = {
        id: songId,
        name: songName,
        artist: artist.split(', '),
        source: source
    };

    // 调用原来的下载逻辑
    await downloadSong(song);
}

async function downloadSong(song, quality = "320") {
    try {
        const urlApi = `https://music-api.gdstudio.xyz/api.php?types=url&source=${song.source}&id=${song.id}&br=128`;
        const response = await fetch(urlApi);
        if (!response.ok) throw new Error('下载链接获取失败');

        const audioData = await response.json();

        if (audioData && audioData.url) {
            const proxiedAudioUrl = buildAudioProxyUrl(audioData.url);
            const preferredAudioUrl = preferHttpsUrl(audioData.url);

            let downloadUrl = proxiedAudioUrl || preferredAudioUrl || audioData.url;
            if (downloadUrl == audioData.url) {
                // 第二步：用 downloadUrl 重新 fetch 音频内容
                const audioResponse = await fetch(downloadUrl);
                if (!audioResponse.ok) {
                    throw new Error("Failed to fetch audio file");
                }
                const blob = await audioResponse.blob();
                downloadUrl = URL.createObjectURL(blob);
                console.log(downloadUrl)
            }

            const link = document.createElement("a");
            link.href = downloadUrl;
            const preferredExtension =
                quality === "999" ? "flac" : quality === "740" ? "ape" : "mp3";
            const fileExtension = (() => {
                try {
                    const url = new URL(audioData.url);
                    const pathname = url.pathname || "";
                    const match = pathname.match(/\.([a-z0-9]+)$/i);
                    if (match) {
                        return match[1];
                    }
                } catch (error) {

                }
                return preferredExtension;
            })();
            link.download = `${song.name} - ${Array.isArray(song.artist) ? song.artist.join(", ") : song.artist}.${fileExtension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            throw new Error("无法获取下载地址");
        }
    } catch (error) {
        console.log(error)
    }
}


function buildAudioProxyUrl(url) {
    if (!url || typeof url !== "string") return url;

    try {
        const parsedUrl = new URL(url, window.location.href);
        if (parsedUrl.protocol === "https:") {
            return parsedUrl.toString();
        }

        if (parsedUrl.protocol === "http:" && /(^|\.)kuwo\.cn$/i.test(parsedUrl.hostname)) {
            return `http://localhost:9000?target=${encodeURIComponent(parsedUrl.toString())}`;
        }

        return parsedUrl.toString();
    } catch (error) {

        return url;
    }
}

function preferHttpsUrl(url) {
    if (!url || typeof url !== "string") return url;

    try {
        const parsedUrl = new URL(url, window.location.href);
        if (parsedUrl.protocol === "http:" && window.location.protocol === "https:") {
            parsedUrl.protocol = "https:";
            return parsedUrl.toString();
        }
        return parsedUrl.toString();
    } catch (error) {
        if (window.location.protocol === "https:" && url.startsWith("http://")) {
            return "https://" + url.substring("http://".length);
        }
        return url;
    }
}

// 更新进度条显示
function updateProgressBar() {
    if (audio.duration && !isDragging) {
        const percent = audio.currentTime / audio.duration;
        progress.style.width = (percent * 100) + '%';
        progressHandle.style.left = (percent * 100) + '%';
    }
}

audio.addEventListener('loadedmetadata', () => {
    updateProgressBar();
});

function changeAudioSource(newUrl) {
    audio.src = newUrl;
    // 重置进度条
    progress.style.width = '0%';
    progressHandle.style.left = '0%';
    // 可选：加载新音频
    audio.load();
    audio.play();
}

audio.addEventListener('ended', () => {
    // 歌曲结束时重置进度条
    setTimeout(() => {
        progress.style.width = '0%';
        progressHandle.style.left = '0%';
    }, 100);
});

audio.addEventListener('timeupdate', () => {
    highlightCurrentLyric(audio.currentTime);
    timeEl.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration || 0);
    updateProgressBar();
});