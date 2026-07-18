import * as PopoverPrimitive from "@radix-ui/react-popover"
import * as React from "react"
import { useCallback, useLayoutEffect, useState } from "react"

import { cn } from "../../lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverClose = PopoverPrimitive.Close

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  // Fix for Electron: ensure position is calculated after content is fully rendered
  const [isPositioned, setIsPositioned] = useState(false)
  const [node, setNode] = useState<HTMLDivElement | null>(null)

  // Use callback ref to detect when element is mounted
  const callbackRef = useCallback((element: HTMLDivElement | null) => {
    setNode(element)
    // Forward ref
    if (typeof ref === 'function') {
      ref(element)
    } else if (ref) {
      ref.current = element
    }
  }, [ref])

  useLayoutEffect(() => {
    if (!node) {
      setIsPositioned(false)
      return
    }
    // Element just mounted, wait for next frame to ensure position is calculated
    setIsPositioned(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPositioned(true)
      })
    })
  }, [node])

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={callbackRef}
        align={align}
        sideOffset={sideOffset}
        // Force position recalculation on every animation frame
        updatePositionStrategy="always"
        avoidCollisions={true}
        collisionPadding={8}
        style={{
          visibility: isPositioned ? 'visible' : 'hidden',
        }}
        className={cn(
          "z-[999999] rounded-xl border border-border/55 bg-popover/95 p-4 text-popover-foreground outline-none pointer-events-auto",
          "shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] ring-1 ring-inset ring-white/[0.03] backdrop-blur-sm",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger }
