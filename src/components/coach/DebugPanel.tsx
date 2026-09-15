'use client';
import { useState } from 'react';
import { Button, Panel } from '@/components/ui';
export function DebugPanel({ data, title = 'Отладочные данные' }: { data: unknown; title?: string }) { const [open, setOpen] = useState(false); return <Panel><Button type="button" variant="ghost" onClick={() => setOpen((value) => !value)}>{open ? 'Скрыть' : 'Показать'} {title}</Button>{open ? <pre className="debug-pre">{JSON.stringify(data, null, 2)}</pre> : null}</Panel>; }
