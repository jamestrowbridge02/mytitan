type FeatureGateMode = 'read' | 'mutation';
type FeatureGateOptions<T> = {
    enabled: boolean;
    feature: string;
    mode: FeatureGateMode;
    fallback?: T;
};
export declare function featureGate<T>({ enabled, feature, mode, fallback }: FeatureGateOptions<T>): T | undefined;
export {};
