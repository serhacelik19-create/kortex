# --- TEK AŞAMALI VE GARANTİ DOCKER KESİTİ ---
# Prisma 7.4.2+ en güncel Node sürümlerini (20.19+ veya 22+) istiyor. 
# Hata payını sıfıra indirmek için Node 22'ye geçiyoruz.
FROM node:22-slim

# Sistem kütüphaneleri (Prisma, SSL ve Python için şart)
RUN apt-get update -y && apt-get install -y \
    openssl ca-certificates \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Tüm dosyaları kopyala
COPY . .

# Node.js bağımlılıklarını yükle
RUN npm install

# Prisma Client'ı oluştur
RUN npx prisma generate

# Python Math Service bağımlılıklarını yükle
RUN python3 -m venv /app/math_service/.venv && \
    /app/math_service/.venv/bin/pip install --no-cache-dir -r /app/math_service/requirements.txt

# Cloud Run için port ayarı
ENV PORT 8080
EXPOSE 8080

# Başlangıç scripti ile hem Python hem Node'u çalıştır
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
