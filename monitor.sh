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

# Membaca Total Bandwidth Terpakai (GB/MB)
rx_bytes_total=$(cat /sys/class/net/$net_interface/statistics/rx_bytes)
tx_bytes_total=$(cat /sys/class/net/$net_interface/statistics/tx_bytes)

total_rx_gb=$(echo "scale=2; $rx_bytes_total / 1024 / 1024 / 1024" | bc)
total_tx_gb=$(echo "scale=2; $tx_bytes_total / 1024 / 1024 / 1024" | bc)

# Mengukur Kecepatan Bandwidth Real-Time (Deltas 1 detik)
rx_before=$(cat /sys/class/net/$net_interface/statistics/rx_bytes)
tx_before=$(cat /sys/class/net/$net_interface/statistics/tx_bytes)
sleep 1
rx_after=$(cat /sys/class/net/$net_interface/statistics/rx_bytes)
tx_after=$(cat /sys/class/net/$net_interface/statistics/tx_bytes)

rx_speed=$(( (rx_after - rx_before) / 1024 ))
tx_speed=$(( (tx_after - tx_before) / 1024 ))

if [ $rx_speed -gt 1024 ]; then
    rx_display="$(echo "scale=2; $rx_speed / 1024" | bc) MB/s"
else
    rx_display="${rx_speed} KB/s"
fi

if [ $tx_speed -gt 1024 ]; then
    tx_display="$(echo "scale=2; $tx_speed / 1024" | bc) MB/s"
else
    tx_display="${tx_speed} KB/s"
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
printf " 📥 Speed DL : %s\n" "$rx_display"
printf " 📤 Speed UL : %s\n" "$tx_display"
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
