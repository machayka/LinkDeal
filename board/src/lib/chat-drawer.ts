import type { ConnectedWallet } from "./wallet";

type ChatFile = { name: string; type: string; size: number; data: string };
type ChatMessage = { id: string; sender: string; text: string; sentAt: number; file?: ChatFile };
type ChatRoom = { roomKey: string; offerId: number | null; title: string; participants: string[] };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function initChatDrawer(walletChange: (callback: (wallet: ConnectedWallet | null) => void) => void) {
  const button = document.querySelector<HTMLButtonElement>("#chat-toggle")!;
  const drawer = document.querySelector<HTMLElement>("#chat-drawer")!;
  const close = document.querySelector<HTMLButtonElement>("#chat-close")!;
  const messages = document.querySelector<HTMLElement>("#chat-messages")!;
  const roomsElement = document.querySelector<HTMLElement>("#chat-rooms")!;
  const roomTitle = document.querySelector<HTMLElement>("#chat-room-title")!;
  const form = document.querySelector<HTMLFormElement>("#chat-form")!;
  const input = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
  const fileInput = document.querySelector<HTMLInputElement>("#chat-file")!;
  const fileLabel = document.querySelector<HTMLElement>("#chat-file-label")!;
  const status = document.querySelector<HTMLElement>("#chat-status")!;
  const hint = document.querySelector<HTMLElement>("#chat-hint")!;
  if (!button || !drawer || !close || !messages || !roomsElement || !roomTitle || !form || !input || !fileInput || !fileLabel || !status || !hint) return;

  const offerChat = document.querySelector<HTMLButtonElement>("#offer-chat");
  const offerId = offerChat?.dataset.offerId;
  const offerAuthor = offerChat?.dataset.chatAuthor;
  const initialRoom = offerId && offerAuthor ? `offer:${offerId}` : "";
  const socketUrl = import.meta.env.PUBLIC_CHAT_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8787`;
  let wallet: ConnectedWallet | null = null;
  let socket: WebSocket | null = null;
  let activeRoom = initialRoom;
  let sessionToken: string | null = null;
  let selectedFile: File | null = null;
  let rooms: ChatRoom[] = [];

  const sessionKey = (address: string) => `linkdeal:chat-session:${address}`;
  const roomsKey = (address: string) => `linkdeal:chat-rooms:${address}`;
  const loadRooms = (address: string): ChatRoom[] => {
    try { return JSON.parse(localStorage.getItem(roomsKey(address)) ?? "[]") as ChatRoom[]; } catch { return []; }
  };
  const setStatus = (text: string, kind: string) => { status.textContent = text; status.className = `badge badge-${kind}`; };
  const send = (payload: object) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); };
  const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
  const roomLabel = (room: ChatRoom) => {
    const keyParticipants = room.roomKey.split(":").slice(2);
    const participant = [...room.participants, ...keyParticipants].find((address) => address !== wallet?.address);
    return `${short(participant ?? "brak adresu")} · ${room.title}`;
  };

  function renderRooms() {
    roomsElement.replaceChildren(...rooms.map((room) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `btn btn-ghost btn-sm h-auto min-h-0 w-full min-w-0 justify-start overflow-hidden text-left ${room.roomKey === activeRoom ? "btn-active" : ""}`;
      item.textContent = roomLabel(room);
      item.title = item.textContent;
      item.classList.add("truncate", "whitespace-nowrap");
      item.onclick = (event) => { event.preventDefault(); if (room.roomKey !== activeRoom) connect(room.roomKey); };
      return item;
    }));
  }

  function render(message: ChatMessage) {
    const own = wallet?.address === message.sender;
    const row = document.createElement("div");
    row.className = `flex ${own ? "justify-end" : "justify-start"}`;
    const bubble = document.createElement("div");
    bubble.className = `max-w-[90%] rounded-box p-2 text-sm ${own ? "bg-primary text-primary-content" : "bg-base-200"}`;
    const meta = document.createElement("div");
    meta.className = "mb-1 text-xs opacity-70";
    meta.textContent = `${short(message.sender)} · ${new Date(message.sentAt).toLocaleTimeString()}`;
    bubble.append(meta);
    if (message.text) { const text = document.createElement("p"); text.className = "whitespace-pre-wrap break-words"; text.textContent = message.text; bubble.append(text); }
    if (message.file) { const link = document.createElement("a"); link.className = "mt-2 block break-all underline"; link.download = message.file.name; link.href = `data:${message.file.type || "application/octet-stream"};base64,${message.file.data}`; link.textContent = `📎 ${message.file.name} (${Math.ceil(message.file.size / 1024)} KB)`; bubble.append(link); }
    row.append(bubble); messages.append(row); messages.scrollTop = messages.scrollHeight;
  }

  function update() {
    const ready = Boolean(wallet && socket?.readyState === WebSocket.OPEN);
    input.disabled = !ready; fileInput.disabled = !ready;
    setStatus(socket?.readyState === WebSocket.OPEN ? (wallet ? "Połączono" : "Podpisz wallet") : "Offline", ready ? "success" : "warning");
  }

  function connect(roomKey: string) {
    if (roomKey.startsWith("offer:") && wallet && offerAuthor && offerId) {
      const participants = [wallet.address, offerAuthor].sort();
      roomKey = `offer:${offerId}:${participants[0]}:${participants[1]}`;
    }
    activeRoom = roomKey;
    messages.replaceChildren();
    const room = rooms.find((entry) => entry.roomKey === roomKey);
    roomTitle.textContent = room ? roomLabel(room) : "Wybierz rozmowę";
    renderRooms();
    socket?.close();
    socket = new WebSocket(socketUrl);
    socket.onopen = () => {
      setStatus("Autoryzacja…", "warning");
      const payload: { type: string; roomKey: string; address?: string; token?: string } = { type: "hello", roomKey };
      if (wallet) {
        payload.address = wallet.address;
        if (roomKey.startsWith("offer:") && offerAuthor && offerId) {
          const participants = [wallet.address, offerAuthor].sort();
          payload.roomKey = `offer:${offerId}:${participants[0]}:${participants[1]}`;
        }
        payload.token = sessionToken ?? localStorage.getItem(sessionKey(wallet.address)) ?? undefined;
      }
      socket?.send(JSON.stringify(payload));
    };
    socket.onclose = () => { if (socket?.url === socketUrl) setStatus("Offline", "error"); };
    socket.onerror = () => { hint.textContent = "Nie można połączyć się z serwerem chatu."; };
    socket.onmessage = async (event) => {
      const payload = JSON.parse(event.data) as { type: string; message?: string | ChatMessage; nonce?: string; token?: string; messages?: ChatMessage[]; rooms?: ChatRoom[] };
      if (payload.type === "challenge" && wallet && typeof payload.message === "string") send({ type: "auth", nonce: payload.nonce, address: wallet.address, signature: await wallet.signMessage(payload.message) });
      else if (payload.type === "ready") { if (payload.token && wallet) { sessionToken = payload.token; localStorage.setItem(sessionKey(wallet.address), payload.token); } (payload.messages ?? []).forEach(render); update(); }
      else if (payload.type === "rooms") {
        rooms = payload.rooms ?? [];
        if (wallet) localStorage.setItem(roomsKey(wallet.address), JSON.stringify(rooms));
        renderRooms();
      }
      else if (payload.type === "message" && payload.message && typeof payload.message !== "string") render(payload.message);
      else if (payload.type === "error") hint.textContent = typeof payload.message === "string" ? payload.message : "Błąd chatu.";
    };
    update();
  }

  button.onclick = () => {
    drawer.classList.toggle("hidden");
    if (!drawer.classList.contains("hidden") && wallet && !socket) {
      const room = activeRoom || rooms[0]?.roomKey;
      if (room) connect(room);
      else hint.textContent = "Otwórz ogłoszenie i kliknij „Otwórz chat”, aby rozpocząć rozmowę.";
    }
  };
  close.onclick = () => drawer.classList.add("hidden");
  fileInput.onchange = () => { selectedFile = fileInput.files?.[0] ?? null; fileLabel.textContent = selectedFile?.name ?? "📎"; };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!wallet || !socket || socket.readyState !== WebSocket.OPEN || (!input.value.trim() && !selectedFile)) return;
    if (selectedFile && selectedFile.size > MAX_FILE_BYTES) { hint.textContent = "Maksymalny rozmiar pliku to 10 MB."; return; }
    const payload: { type: string; text: string; file?: ChatFile } = { type: "message", text: input.value.trim() };
    if (selectedFile) payload.file = { name: selectedFile.name, type: selectedFile.type, size: selectedFile.size, data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error("Nie udało się odczytać pliku.")); reader.readAsDataURL(selectedFile!); }) };
    send(payload); input.value = ""; fileInput.value = ""; selectedFile = null; fileLabel.textContent = "📎";
  };
  walletChange((next) => {
    wallet = next;
    sessionToken = next ? localStorage.getItem(sessionKey(next.address)) : null;
    rooms = next ? loadRooms(next.address) : [];
    renderRooms();
    socket?.close();
    socket = null;
    if (next && !drawer.classList.contains("hidden") && (activeRoom || rooms[0]?.roomKey)) connect(activeRoom || rooms[0].roomKey);
    update();
  });
}
