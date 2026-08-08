#!/bin/bash

# Fungsi Bar dengan Kotak Khas
get_bar() {
    local percent=${1%.*}
    [ -z "$percent" ] && percent=0
    local filled=$(( (percent * 10) / 100 ))
    [ $filled -gt 10 ] && filled=10
    local empty=$(( 10 - filled ))
    local bar=""
    for ((i=0; i<filled; i++)); do bar+="■"; done
    for ((i=0; i<empty; i++)); do bar+="□"; done
    echo "$bar"
}

# Status Emoji berdasarkan persen
get_status() {
    local pct=${1%.*}
    if [ "$pct" -ge 90 ]; then echo "🔴"
    elif [ "$pct" -ge 70 ]; then echo "🟡"
    else echo "🟢"; fi
}

# Info Dasar
os=$(grep -w PRETTY_NAME /etc/os-release | cut -d '"' -f2)
uptime_str=$(uptime -p | sed 's/up //')
ip_pub=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo "N/A")
isp_pub=$(curl -s --max-time 3 ipinfo.io/org 2>/dev/null | cut -d' ' -f2- || echo "N/A")
load_avg=$(uptime | awk -F'load average:' '{print $2}' | xargs)
proc_count=$(ps aux --no-headers | wc -l)

# CPU
cpu_load=$(top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}' | cut -d. -f1)
[ -z "$cpu_load" ] && cpu_load=0
cpu_bar=$(get_bar "$cpu_load")
cpu_status=$(get_status "$cpu_load")

# RAM
ram_total=$(free -m | awk '/Mem:/{print $2}')
ram_used=$(free -m | awk '/Mem:/{print $3}')
[ -z "$ram_total" ] || [ "$ram_total" -eq 0 ] && ram_total=1
ram_pct=$(( ram_used * 100 / ram_total ))
ram_bar=$(get_bar "$ram_pct")
ram_status=$(get_status "$ram_pct")

# DISK
disk_total=$(df -h / | awk 'NR==2{print $2}')
disk_used=$(df -h / | awk 'NR==2{print $3}')
disk_pct=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
disk_bar=$(get_bar "$disk_pct")
disk_status=$(get_status "$disk_pct")

# Network - deteksi interface utama otomatis (fallback eth0)
net_iface=$(ip route 2>/dev/null | awk '/^default/{print $5; exit}')
[ -z "$net_iface" ] && net_iface=$(ls /sys/class/net 2>/dev/null | grep -v lo | head -n1)
[ -z "$net_iface" ] && net_iface="eth0"

if [ -d "/sys/class/net/$net_iface" ]; then
    rx_total=$(cat /sys/class/net/$net_iface/statistics/rx_bytes)
    tx_total=$(cat /sys/class/net/$net_iface/statistics/tx_bytes)
    rx_total_gb=$(echo "scale=2; $rx_total/1024/1024/1024" | bc)
    tx_total_gb=$(echo "scale=2; $tx_total/1024/1024/1024" | bc)

    rx_b1=$rx_total
    tx_b1=$tx_total
    sleep 1
    rx_b2=$(cat /sys/class/net/$net_iface/statistics/rx_bytes)
    tx_b2=$(cat /sys/class/net/$net_iface/statistics/tx_bytes)

    rx_bps=$(( rx_b2 - rx_b1 ))
    tx_bps=$(( tx_b2 - tx_b1 ))
else
    rx_total_gb="0.00"; tx_total_gb="0.00"; rx_bps=0; tx_bps=0
fi

format_speed() {
    local bps=$1
    if [ $bps -ge 1048576 ]; then
        echo "$(echo "scale=2; $bps/1048576" | bc) MB/s"
    elif [ $bps -ge 1024 ]; then
        echo "$(echo "scale=1; $bps/1024" | bc) KB/s"
    else
        echo "${bps} B/s"
    fi
}

rx_spd=$(format_speed $rx_bps)
tx_spd=$(format_speed $tx_bps)

# TOP PROCESS (Dibersihkan path-nya & diformat rata kanan rapi)
top3=$(ps -eo comm,%cpu --sort=-%cpu | awk 'NR>1 && NR<=4 {
    cmd=$1
    # Jika nama berupa path (ada slash), ambil nama file-nya saja
    n = split(cmd, parts, "/")
    clean_cmd = parts[n]
    if (length(clean_cmd) > 13) {
        clean_cmd = substr(clean_cmd, 1, 10) "..."
    }
    printf " • %-14s➜ %5s%%\n", clean_cmd, $2
}')

# OUTPUT TAMPILAN ELEGAN
cat << ENDOUT
╔══════════════════════════╗
     🛰️  VPS VITAL MONITOR
╚══════════════════════════╝

📍 SYSTEM INFO
   OS      : $os
   IP      : $ip_pub
   ISP     : $isp_pub
   Uptime  : $uptime_str
   Load    : $load_avg
   Proses  : $proc_count aktif
────────────────────────────
📊 RESOURCE USAGE
$cpu_status CPU   [${cpu_bar}] ${cpu_load}%
$ram_status RAM   [${ram_bar}] ${ram_pct}% (${ram_used}/${ram_total} MB)
$disk_status DISK  [${disk_bar}] ${disk_pct}% (${disk_used}/${disk_total})
────────────────────────────
📶 NETWORK (${net_iface})
   📥 Download  : $rx_spd
   📤 Upload    : $tx_spd
   📦 Total RX  : ${rx_total_gb} GB
   📦 Total TX  : ${tx_total_gb} GB
────────────────────────────
🔥 TOP PROCESS
$top3
ENDOUT
