// components/FeatureTile.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Phone,
  Bot,
  MessageCircle,
  FileText,
  Type,
} from "lucide-react";

type IconName = "Phone" | "Bot" | "MessageCircle" | "FileText" | "Type";

const ICONS: Record<IconName, React.ElementType> = {
  Phone,
  Bot,
  MessageCircle,
  FileText,
  Type,
};

export default function FeatureTile({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  const Icon = ICONS[icon];

  return (
    <Card className="h-full">
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <Icon className="h-8 w-8 text-primary" />
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
