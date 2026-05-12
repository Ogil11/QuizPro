"use client"

import React from "react"
import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"

interface FeedbackMarkdownProps {
  content: string
  className?: string
}

export function FeedbackMarkdown({ content, className }: FeedbackMarkdownProps) {
  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 text-sm leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-primary">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          code: ({ children }) => (
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/30 pl-3 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
