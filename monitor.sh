#!/bin/bash

# Fungsi Grafik Bar
get_bar() {
    local percent=${1%.*}
    if [ -z "$percent" ]; then percent=0; fi
    local size=10
    local filled=$(( (percent * size) / 100 ))
    if [ $filled -gt 10 ]; then filled=10; fi
    local empty=$(( size - filled ))
    local bar=""
    for ((i=0; i<filled; i++)); do bar+="■"; done
    for ((i=0; i<empty; i++)); do bar+="□"; done
    echo "$bar"
}

# Info Dasar
os=$(cat /etc/os-release | grep -w PRETTY_NAME | cut -d '"' -f 2)
uptime=$(uptime -p | sed 's/up //')
ip_pub=$(curl -s --max-time 2 ifconfig.me || echo "Offline")

# Resource Usage
cpu_load=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
cpu_bar=$(get_bar "$cpu_load")

ram_total=$(free -m | awk '/Mem:/ {print $2}')
ram_used=$(free -m | awk '/Mem:/ {print $3}')
ram_pct=$(( ram_used * 100 / ram_total ))
ram_bar=$(get_bar "$ram_pct")

disk_used=$(df -h / | awk 'NR==2{print $3}')
disk_pct=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
disk_bar=$(get_bar "$disk_pct")

# Deteksi Network Interface Utama
net_interface="eth0"

# Membaca Total Bandwidth Terpakai (GB)
rx_bytes_total=$(cat /sys/class/net/$net_interface/statistics/rx_bytes)
tx_bytes_total=$(cat /sys/class/net/$net_interface/statistics/tx_bytes)

total_rx_gb=$(echo "scale=2; $rx_bytes_total / 1024 / 1024 / 1024" | bc)
total_tx_gb=$(echo "scale=2; $tx_bytes_total / 1024 / 1024 / 1024" | bc)

# Ambil byte sebelum jeda
rx_before=$(cat /sys/class/net/$net_interface/statistics/rx_bytes)
tx_before=$(cat /sys/class/net/$net_interface/statistics/tx_bytes)

# Jeda tepat 1 detik
sleep 1

# Ambil byte setelah jeda
rx_after=$(cat /sys/class/net/$net_interface/statistics/rx_bytes)
tx_after=$(cat /sys/class/net/$net_interface/statistics/tx_bytes)

# Kalkulasi kecepatan download (RX) & upload (TX) dalam Byte per detik
rx_speed_bps=$(( rx_after - rx_before ))
tx_speed_bps=$(( tx_after - tx_before ))

# Konversi kecepatan Download ke KB/s atau MB/s
if [ $rx_speed_bps -ge 1048576 ]; then
    rx_display="$(echo "scale=2; $rx_speed_bps / 1048576" | bc) MB/s"
elif [ $rx_speed_bps -ge 1024 ]; then
    rx_display="$(echo "scale=1; $rx_speed_bps / 1024" | bc) KB/s"
else
    rx_display="${rx_speed_bps} B/s"
fi

# Konversi kecepatan Upload ke KB/s atau MB/s
if [ $tx_speed_bps -ge 1048576 ]; then
    tx_display="$(echo "scale=2; $tx_speed_bps / 1048576" | bc) MB/s"
elif [ $tx_speed_bps -ge 1024 ]; then
    tx_display="$(echo "scale=1; $tx_speed_bps / 1024" | bc) KB/s"
else
    tx_display="${tx_speed_bps} B/s"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 🛰️ VPS VITAL MONITOR 🛰️ "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 SYSTEM INFO"
echo " • OS     : $os"
echo " • Uptime : $uptime"
echo " • IP Pub : $ip_pub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESOURCE USAGE"
printf "🚀 CPU  [%-10s] %s%%\n" "$cpu_bar" "$cpu_load"
printf "🧠 RAM  [%-10s] %s%%\n" "$ram_bar" "$ram_pct"
printf "💾 DISK [%-10s] %s%%\n" "$disk_bar" "$disk_pct"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📶 NETWORK TRAFFIC"
printf " 📥 Download : %s\n" "$rx_display"
printf " 📤 Upload   : %s\n" "$tx_display"
printf " 📦 Total RX : %s GB\n" "$total_rx_gb"
printf " 📦 Total TX : %s GB\n" "$total_tx_gb"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 TOP CPU PROCESSES"
ps -eo comm,%cpu --sort=-%cpu | head -n 4 | awk 'NR>1 { 
    cmd=$1; 
    if (length(cmd) > 12) cmd=substr(cmd,1,10)"..";
    printf " • %-12s ➜ %5s%%\n", cmd, $2 
}'
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
