/**
 * Единый стиль иконок кабинета: сплошные (filled) глифы, цвет — currentColor.
 * Сначала берём собственный набор MultiFrame (Recraft), а где подходящей иконки
 * в наборе нет — Phosphor в весе `fill`, он совпадает с набором по плотности.
 * Линейные по природе знаки (×, +, …, внешняя ссылка) в `fill` у Phosphor превращаются
 * в плашку с вырезом, поэтому для них взят `bold` — та же толщина, без плашки.
 */
import type { Icon as PhosphorIcon, IconProps as PhosphorProps } from '@phosphor-icons/react';
import {
  ArrowRight,
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  CheckCircle,
  DotsThree,
  DownloadSimple,
  Export,
  Eye,
  EyeSlash,
  NotePencil,
  PaperPlaneTilt,
  Plus,
  PlusSquare,
  UsersThree,
  X,
} from '@phosphor-icons/react';

export * from './recraft';
export type { IconProps } from './recraft';

export type FilledIconProps = Omit<PhosphorProps, 'weight'>;

function filled(Icon: PhosphorIcon, displayName: string, weight: 'fill' | 'bold' = 'fill') {
  function Filled({ size = 24, ...rest }: FilledIconProps) {
    return <Icon weight={weight} size={size} aria-hidden focusable="false" {...rest} />;
  }
  Filled.displayName = displayName;
  return Filled;
}

export const ArrowRightIcon = filled(ArrowRight, 'ArrowRightIcon');
export const ExternalIcon = filled(ArrowSquareOut, 'ExternalIcon', 'bold');
export const ChevronLeftIcon = filled(CaretLeft, 'ChevronLeftIcon');
export const ChevronRightIcon = filled(CaretRight, 'ChevronRightIcon');
export const CheckCircleIcon = filled(CheckCircle, 'CheckCircleIcon');
// У «…» в весе fill точки вырезаны из плашки — в bold это те же сплошные точки.
export const MoreIcon = filled(DotsThree, 'MoreIcon', 'bold');
export const DownloadIcon = filled(DownloadSimple, 'DownloadIcon');
export const ShareIcon = filled(Export, 'ShareIcon');
export const EyeIcon = filled(Eye, 'EyeIcon');
export const EyeOffIcon = filled(EyeSlash, 'EyeOffIcon');
export const DraftIcon = filled(NotePencil, 'DraftIcon');
export const SendIcon = filled(PaperPlaneTilt, 'SendIcon');
export const PlusIcon = filled(Plus, 'PlusIcon', 'bold');
export const PlusSquareIcon = filled(PlusSquare, 'PlusSquareIcon');
export const TeamIcon = filled(UsersThree, 'TeamIcon');
export const CloseIcon = filled(X, 'CloseIcon', 'bold');
