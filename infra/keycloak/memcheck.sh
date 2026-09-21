#!/bin/sh
echo "=== memory.max ==="
cat /sys/fs/cgroup/memory.max 2>/dev/null
echo "=== memory.high ==="
cat /sys/fs/cgroup/memory.high 2>/dev/null
echo "=== cpu.max ==="
cat /sys/fs/cgroup/cpu.max 2>/dev/null
echo "=== nproc ==="
nproc
echo "=== free ==="
free -m 2>/dev/null
echo "=== env PORT ==="
echo "PORT=$PORT"
echo "=== done ==="
sleep 60
